import { type NextRequest } from "next/server";
import nodemailer from "nodemailer";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { BACKEND } from "@/lib/backend";
import { adminDb } from "@/lib/firebase-admin";
import type { Partner, Trade } from "@/types";
import { safeNumber } from "@/lib/utils";
import {
  tradeProfit,
  tradeProfitDate,
  tradeMonthKey,
  cumulativeNetForPartner,
  monthlyPartnerDist,
} from "@/lib/partner-profit";
import type { MonthlyReportData, PartnerPosition } from "@/lib/report-pdf";
import { buildPartnerEmailHtml } from "@/lib/report-email";

function previousMonthKey(): string {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

// Verify the caller's Firebase ID token WITHOUT firebase-admin/auth. Its
// jwks-rsa → jose dependency is ESM-only and crashes under Vercel's
// serverless loader (ERR_REQUIRE_ESM). Google's Identity Toolkit REST
// endpoint verifies the token's signature + expiry server-side and returns
// the account's custom claims, so we can gate on gp === true. The web API
// key is public (it already ships in the client bundle).
const FIREBASE_WEB_API_KEY = "AIzaSyBRJS4nWcPyVD97gQXm9G9yWFhMfxAK7E0";
async function callerIsGP(idToken: string): Promise<boolean> {
  try {
    const res = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${FIREBASE_WEB_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken }),
      }
    );
    if (!res.ok) return false;
    const data = (await res.json()) as {
      users?: Array<{ customAttributes?: string }>;
    };
    const attrs = data.users?.[0]?.customAttributes;
    if (!attrs) return false;
    const claims = JSON.parse(attrs) as { gp?: boolean };
    return claims.gp === true;
  } catch {
    return false;
  }
}

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
    // Auth: this endpoint can email every partner, so require the caller
    // to be the GP. The app sends the signed-in user's Firebase ID token
    // (Authorization: Bearer …); we verify it and require the gp claim.
    // An optional REPORT_SECRET (x-report-secret header) is also accepted
    // for non-browser callers. One of the two must pass.
    const requiredSecret = process.env.REPORT_SECRET;
    const providedSecret = request.headers.get("x-report-secret");
    const secretOk = !!requiredSecret && providedSecret === requiredSecret;

    let gpOk = false;
    const authz = request.headers.get("authorization") || "";
    const idToken = authz.startsWith("Bearer ") ? authz.slice(7).trim() : "";
    if (idToken) {
      gpOk = await callerIsGP(idToken);
    }

    if (!secretOk && !gpOk) {
      return Response.json(
        { success: false, error: "Unauthorized — سجّل الدخول كمدير." },
        { status: 401 }
      );
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

    // Stored (frozen / GP-edited) monthly-profit records win over the live
    // compute so the email matches the app and the log exactly.
    const storedByKey = new Map<
      string,
      { gross: number; fee: number; net: number }
    >();
    const storedNetByPartner: Record<string, Record<string, number>> = {};
    if (BACKEND === "firebase") {
      const mpSnap = await adminDb().collection("monthly_profits").get();
      for (const d of mpSnap.docs) {
        const r = d.data();
        const mo = String(r.month);
        const pid = String(r.partnerId);
        storedByKey.set(`${mo}__${pid}`, {
          gross: safeNumber(r.gross),
          fee: safeNumber(r.fee),
          net: safeNumber(r.net),
        });
        (storedNetByPartner[pid] ??= {})[mo] = safeNumber(r.net);
      }

      // Auto-freeze the just-ended month so its numbers stop drifting —
      // same guard as the reports workflow: only the previous month, and
      // never overwriting an existing / GP-edited record.
      if (month === previousMonthKey()) {
        for (const p of partners) {
          const key = `${month}__${p.id}`;
          if (storedByKey.has(key)) continue;
          const fm = monthlyPartnerDist(partners, trades, p.id, month);
          if (!fm || (fm.grossProfit === 0 && fm.netProfit === 0)) continue;
          await adminDb().collection("monthly_profits").doc(key).set({
            id: key,
            month,
            partnerId: p.id,
            gross: fm.grossProfit,
            fee: fm.feeAmount,
            net: fm.netProfit,
            updated_at: new Date().toISOString(),
          });
          storedByKey.set(key, {
            gross: fm.grossProfit,
            fee: fm.feeAmount,
            net: fm.netProfit,
          });
          (storedNetByPartner[p.id] ??= {})[month] = fm.netProfit;
        }
      }
    }

    // Trades whose profit belongs to the selected month — same
    // bucketing (tradeMonthKey) the dashboard uses.
    const tradesInMonth = trades.filter((t) => tradeMonthKey(t) === month);

    // Per-partner monthly figures are computed inside the loop via
    // monthlyPartnerDist — each partner weighted by the capital they
    // held THAT month (stable, entry-date-gated, settlement-blind), so a
    // later deposit/settlement never rewrites a past month's statement.

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

      const md = monthlyPartnerDist(partners, trades, partner.id, month);
      const st = storedByKey.get(`${month}__${partner.id}`);
      if (!md && !st) {
        results.push({
          partnerId: partner.id,
          name: partner.name,
          status: "skipped",
          reason: "no distribution data",
        });
        continue;
      }

      // Stored (frozen / GP-edited) figures win; live compute is the
      // fallback for months not yet saved.
      const gross = st?.gross ?? md?.grossProfit ?? 0;
      const fee = st?.fee ?? md?.feeAmount ?? 0;
      const net = st?.net ?? md?.netProfit ?? 0;
      const investment = md?.investment ?? 0;
      const returnPct = investment > 0 ? (net / investment) * 100 : 0;

      // This partner's slice of each trade = their THAT-MONTH ownership ×
      // trade P&L, restricted to trades earned on/after their entry date.
      const ownershipShare = (md?.ownershipPct ?? 0) / 100;
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
          ownershipPct: md?.ownershipPct ?? 0,
        },
        partnerSummary: {
          investment,
          grossProfit: gross,
          feeRatePct: md?.feeRatePct ?? partner.managementFeeRate,
          feeAmount: fee,
          netProfit: net,
          returnPct,
          currentBalance: partner.currentBalance,
          cumulativeNetProfit: cumulativeNetForPartner(
            partners,
            trades,
            partner.id,
            month,
            storedNetByPartner[partner.id]
          ),
        },
        positions,
      };

      try {
        const { subject, html } = buildPartnerEmailHtml(reportData);
        await transporter.sendMail({
          from: `"AlGhanim Options Desk" <${gmailUser}>`,
          to: partner.email,
          subject,
          html,
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
