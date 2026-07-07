import { type NextRequest } from "next/server";
import nodemailer from "nodemailer";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import type { Partner, Trade } from "@/types";
import { safeNumber, getPartnerInvestment } from "@/lib/utils";
import {
  computePortfolioDistribution,
  tradeProfit,
  tradeMonthKey,
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
  };
}

function computeMonthlyBuckets(trades: Trade[]): Record<string, number> {
  const buckets: Record<string, number> = {};
  for (const t of trades) {
    const key = tradeMonthKey(t);
    if (!key) continue;
    buckets[key] = (buckets[key] ?? 0) + tradeProfit(t);
  }
  return buckets;
}

export async function POST(request: NextRequest) {
  try {
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

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

    // --- Authorization: require a valid Supabase session -------------------
    // The browser sends its access token as `Authorization: Bearer <jwt>`.
    // Reject anyone without a valid session so this route can no longer be
    // triggered anonymously (which would blast confidential PDFs to every
    // partner and leak partner names/existence).
    const authHeader = request.headers.get("authorization") ?? "";
    const token = authHeader.replace(/^Bearer\s+/i, "").trim();
    if (!token) {
      return Response.json(
        { success: false, error: "Unauthorized" },
        { status: 401 }
      );
    }
    const authClient = createClient<Database>(supabaseUrl, supabaseAnonKey);
    const {
      data: { user },
      error: authError,
    } = await authClient.auth.getUser(token);
    if (authError || !user) {
      return Response.json(
        { success: false, error: "Unauthorized" },
        { status: 401 }
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

    // DB client scoped to the caller's session, so it reads under the
    // authenticated role that migration 015's RLS policies allow.
    const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });

    // Fetch partners
    const { data: partnerRows, error: pError } = await supabase
      .from("partners")
      .select("*")
      .is("archived_at", null);

    if (pError) throw new Error(`Failed to fetch partners: ${pError.message}`);

    const partners = (partnerRows ?? []).map(rowToPartner);

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

    // Fetch trades
    const { data: tradeRows, error: tError } = await supabase
      .from("trades")
      .select("*");

    if (tError) throw new Error(`Failed to fetch trades: ${tError.message}`);

    const trades: Trade[] = (tradeRows ?? []).map((r) => ({
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
    }));

    // Compute monthly profit
    const buckets = computeMonthlyBuckets(trades);
    const monthProfit = buckets[month] ?? 0;

    // Compute per-partner distribution
    const distribution = computePortfolioDistribution(partners, monthProfit);

    const totalAUM = partners.reduce(
      (sum, p) => sum + (Number(p.currentBalance) || 0),
      0
    );

    // Pre-compute the trades active in the selected month — same date logic
    // as computeMonthlyBuckets so position-share totals match monthProfit.
    const tradesInMonth = trades.filter((t) => tradeMonthKey(t) === month);

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

      // This partner's slice of each trade = ownership × trade P&L.
      // Matches the simple-ownership split used by computePortfolioDistribution.
      // The trade-wide total is never sent to the partner — only their share.
      const ownershipShare =
        totalAUM > 0 ? (Number(partner.currentBalance) || 0) / totalAUM : 0;
      const positions: PartnerPosition[] = tradesInMonth.map((t) => ({
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
