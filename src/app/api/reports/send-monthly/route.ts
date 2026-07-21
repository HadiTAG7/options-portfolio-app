import { type NextRequest } from "next/server";
import nodemailer from "nodemailer";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { BACKEND } from "@/lib/backend";
import { adminDb } from "@/lib/firebase-admin";
import type { Partner, Trade } from "@/types";
import { safeNumber, getPartnerInvestment } from "@/lib/utils";
import {
  computePartnerDistributionFromTrades,
  tradeProfit,
  tradeProfitDate,
  tradeMonthKey,
  asEarnedBasis,
  cumulativeNetForPartner,
} from "@/lib/partner-profit";
import {
  generatePartnerReportPDF,
  type MonthlyReportData,
  type PartnerPosition,
} from "@/lib/report-pdf";

type PartnerRow = Database["public"]["Tables"]["partners"]["Row"];

function rowToPartner(row: PartnerRow): Partner {
  const currentBalance =
    safeNumber(row.currentBalance) || safeNumber(row.total_balance);
  const feePercent =
    safeNumber(row.managementFeePercent) || safeNumber(row.management_fee_rate);
  return {
    id: row.id,
    name: row.name,
    code: row.code ?? "",
    email: row.email ?? null,
    initials: row.initials ?? "",
    avatarUrl: row.avatar_url ?? undefined,
    totalBalance: safeNumber(row.total_balance),
    ownershipPercentage: safeNumber(row.ownership_percentage),
    managementFeeRate: feePercent,
    performance24h: safeNumber(row.performance_24h),
    performanceTrend: row.performance_trend ?? "up",
    joinedAt: row.joined_at,
    entryDate: row.entry_date ?? null,
    lastSettlementDate: row.last_settlement_date ?? null,
    isAdmin: row.isAdmin ?? false,
    totalDeposits: safeNumber(row.totalDeposits),
    totalWithdrawals: safeNumber(row.totalWithdrawals),
    currentBalance,
    totalNetProfit: safeNumber(row.totalNetProfit),
    managementFeesPaid: safeNumber(row.managementFeesPaid),
    baseCapital: safeNumber(row.baseCapital) || currentBalance,
    balanceHistory: Array.isArray(row.balanceHistory)
      ? (row.balanceHistory as Partner["balanceHistory"])
      : [],
    archivedAt: row.archived_at ?? null,
    gpFeesAccrued: safeNumber(row.gpFeesAccrued),
    profitTakenGross: safeNumber(row.profitTakenGross),
  };
}

export async function POST(request: NextRequest) {
  try {
    // Optional shared-secret guard. This endpoint is otherwise
    // unauthenticated and can email every partner — set REPORT_SECRET
    // in the deployment env and the same value must arrive in the
    // x-report-secret header. Left unset, the guard is off (dev mode).
    const requiredSecret = process.env.REPORT_SECRET;
    if (requiredSecret) {
      const provided = request.headers.get("x-report-secret");
      if (provided !== requiredSecret) {
        return Response.json(
          { success: false, error: "Unauthorized." },
          { status: 401 }
        );
      }
    }

    const { month, partnerId } = (await request.json()) as {
      month: string;
      partnerId?: string;
    };

    if (!month || !/^\d{4}-\d{2}$/.test(month)) {
      return Response.json(
        { success: false, error: "Invalid month format. Use YYYY-MM." },
        { status: 400 }
      );
    }

    const gmailUser = process.env.GMAIL_USER;
    const gmailAppPassword = process.env.GMAIL_APP_PASSWORD;
    if (!gmailUser || !gmailAppPassword) {
      return Response.json(
        {
          success: false,
          error:
            "GMAIL_USER or GMAIL_APP_PASSWORD not configured. Generate an App Password at myaccount.google.com/apppasswords.",
        },
        { status: 500 }
      );
    }

    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: { user: gmailUser, pass: gmailAppPassword },
    });

    // Server-side reads — branch by backend. Firebase: firebase-admin
    // bypasses firestore.rules (like service_role bypasses RLS).
    // Supabase: service key (RLS is locked), anon fallback pre-013.
    let partnerRows: PartnerRow[] = [];
    let tradeRows: Database["public"]["Tables"]["trades"]["Row"][] = [];
    if (BACKEND === "firebase") {
      const db = adminDb();
      const [pSnap, tSnap] = await Promise.all([
        db.collection("partners").get(),
        db.collection("trades").get(),
      ]);
      partnerRows = pSnap.docs
        .map((d) => d.data() as PartnerRow)
        .filter((r) => !r.archived_at);
      tradeRows = tSnap.docs.map(
        (d) => d.data() as Database["public"]["Tables"]["trades"]["Row"]
      );
    } else {
      const supabase = createClient<Database>(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY ??
          process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
      );
      const { data: pData, error: pError } = await supabase
        .from("partners")
        .select("*")
        .is("archived_at", null);
      if (pError)
        throw new Error(`Failed to fetch partners: ${pError.message}`);
      partnerRows = pData ?? [];

      const { data: tData, error: tError } = await supabase
        .from("trades")
        .select("*");
      if (tError) throw new Error(`Failed to fetch trades: ${tError.message}`);
      tradeRows = tData ?? [];
    }

    const partners = partnerRows.map(rowToPartner);

    // Optional single-recipient mode. We still keep the full partners list
    // for ownership/distribution math (so a partner's share doesn't change
    // when only they receive the email) and only narrow the send loop.
    const targetPartners = partnerId
      ? partners.filter((p) => p.id === partnerId)
      : partners;
    if (partnerId && targetPartners.length === 0) {
      return Response.json(
        { success: false, error: "Partner not found." },
        { status: 404 }
      );
    }

    const trades: Trade[] = tradeRows.map((r) => ({
      id: r.id,
      ticker: r.ticker,
      type: r.type,
      quantity: r.quantity,
      premium: r.premium,
      strike: r.strike,
      result: r.result,
      expiration: r.expiration,
      date: r.date,
      status: r.status,
      autoClosed: r.autoClosed,
      createdAt: r.created_at ?? null,
    }));

    // Trades whose profit belongs to the selected month — same
    // bucketing (tradeMonthKey) the dashboard uses.
    const tradesInMonth = trades.filter((t) => tradeMonthKey(t) === month);

    // Per-partner distribution for the STATEMENT month, built
    // trade-by-trade so entry-date eligibility is honored: a partner
    // who joined in June must not receive a March report crediting
    // them with March profit. The flat ownership × monthProfit split
    // used previously ignored entry dates entirely.
    //
    // lastSettlementDate is deliberately nulled: this is a historical
    // statement of what was EARNED in the month. A later settlement
    // moved that profit into capital — it doesn't un-earn it, and a
    // settled partner's statement must not read $0.
    const statementPartners = partners.map(asEarnedBasis);
    const distribution = computePartnerDistributionFromTrades(
      statementPartners,
      tradesInMonth
    );

    // Same investment-weighted ownership the distribution engine uses,
    // so a partner's per-trade share in the PDF matches their
    // grossProfit to the penny.
    const totalInvestment = partners.reduce(
      (sum, p) => sum + getPartnerInvestment(p),
      0
    );

    // Period label
    const [y, m] = month.split("-");
    const periodDate = new Date(Number(y), Number(m) - 1);
    const periodLabel = periodDate.toLocaleString("en-US", {
      month: "long",
      year: "numeric",
    });

    // Send reports
    const results: Array<{
      partnerId: string;
      name: string;
      status: "sent" | "skipped" | "error";
      reason?: string;
    }> = [];

    for (const partner of targetPartners) {
      if (!partner.email) {
        results.push({
          partnerId: partner.id,
          name: partner.name,
          status: "skipped",
          reason: "no email",
        });
        continue;
      }

      const dist = distribution[partner.id];
      if (!dist) {
        results.push({
          partnerId: partner.id,
          name: partner.name,
          status: "skipped",
          reason: "no distribution data",
        });
        continue;
      }

      // This partner's slice of each trade = ownership × trade P&L,
      // restricted to trades earned on/after their entry date — the
      // same gate the distribution engine applies, so the per-trade
      // shares sum to dist.grossProfit exactly.
      const ownershipShare =
        totalInvestment > 0
          ? getPartnerInvestment(partner) / totalInvestment
          : 0;
      const entry = partner.entryDate?.trim();
      const positions: PartnerPosition[] = tradesInMonth
        .filter((t) => {
          const profitDate = tradeProfitDate(t);
          if (!profitDate) return false;
          return !entry || entry <= profitDate;
        })
        .map((t) => ({
          ticker: t.ticker,
          type: t.type,
          share: tradeProfit(t) * ownershipShare,
        }));

      const reportData: MonthlyReportData = {
        periodLabel,
        periodKey: month,
        partner: {
          name: partner.name,
          code: partner.code,
          ownershipPct: dist.ownershipPct,
        },
        partnerSummary: {
          investment: getPartnerInvestment(partner),
          grossProfit: dist.grossProfit,
          feeRatePct: dist.feeRatePct,
          feeAmount: dist.feeAmount,
          netProfit: dist.netProfit,
          returnPct: dist.returnPct,
          currentBalance: partner.currentBalance,
          cumulativeNetProfit: cumulativeNetForPartner(
            partners,
            trades,
            partner.id,
            month
          ),
        },
        positions,
      };

      try {
        const pdfBuffer = generatePartnerReportPDF(reportData);
        const filename = `report-${month}-${partner.code || partner.name}.pdf`;

        await transporter.sendMail({
          from: `"AlGhanim Options Desk" <${gmailUser}>`,
          to: partner.email,
          subject: `Monthly Report - ${periodLabel} - ${partner.name}`,
          html: `<div style="font-family: sans-serif; direction: rtl; text-align: right;">
            <h2 style="color: #34d399;">AlGhanim Options Desk</h2>
            <p>مرحباً ${partner.name}،</p>
            <p>مرفق تقريرك الشهري عن أداء استثمارك لشهر <strong>${periodLabel}</strong>.</p>
            <br/>
            <p style="color: #999; font-size: 12px;">هذا التقرير سري ومخصص للمستثمر المعني فقط.</p>
          </div>`,
          attachments: [
            {
              filename,
              content: pdfBuffer,
              contentType: "application/pdf",
            },
          ],
        });

        results.push({
          partnerId: partner.id,
          name: partner.name,
          status: "sent",
        });
      } catch (err: unknown) {
        const msg =
          err && typeof err === "object" && "message" in err
            ? (err as { message: string }).message
            : "Unknown error";
        results.push({
          partnerId: partner.id,
          name: partner.name,
          status: "error",
          reason: msg,
        });
      }
    }

    const sentCount = results.filter((r) => r.status === "sent").length;
    const skippedCount = results.filter((r) => r.status === "skipped").length;
    const errorCount = results.filter((r) => r.status === "error").length;

    return Response.json({
      success: true,
      month,
      sentCount,
      skippedCount,
      errorCount,
      results,
    });
  } catch (err: unknown) {
    const msg =
      err && typeof err === "object" && "message" in err
        ? (err as { message: string }).message
        : "Internal server error";
    return Response.json({ success: false, error: msg }, { status: 500 });
  }
}
