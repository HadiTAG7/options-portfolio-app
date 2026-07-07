import { type NextRequest } from "next/server";
import { serviceClient, authedEmail } from "@/lib/supabase-server";
import {
  rowToPartner,
  rowToTrade,
  computeInvestorReport,
  computeAllTimeNet,
  latestMonthWithData,
  findPartnerByEmail,
} from "@/lib/portal-data";

function currentMonthKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function recentMonths(n: number): string[] {
  const out: string[] = [];
  const now = new Date();
  for (let i = 0; i < n; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }
  return out;
}

// Investor portal data. Authenticates the caller by their Supabase session,
// links them to a partner row by email, and returns ONLY that investor's own
// summary, position shares, and transactions. All fund-wide reads happen with
// the service role on the server; no other partner's data leaves this route.
export async function GET(request: NextRequest) {
  try {
    const email = await authedEmail(request);
    if (!email) {
      return Response.json(
        { success: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    // A caller-supplied month wins; otherwise we resolve the default AFTER
    // loading trades (to the latest month that actually has data), so the
    // portal never opens on an empty current month.
    const monthParam = request.nextUrl.searchParams.get("month");
    const explicitMonth =
      monthParam && /^\d{4}-\d{2}$/.test(monthParam) ? monthParam : null;

    const supabase = serviceClient();

    const { data: partnerRows, error: pErr } = await supabase
      .from("partners")
      .select("*")
      .is("archived_at", null);
    if (pErr) throw new Error(`Failed to load partners: ${pErr.message}`);
    const partners = (partnerRows ?? []).map(rowToPartner);

    const me = findPartnerByEmail(partners, email);
    if (!me) {
      return Response.json(
        {
          success: false,
          error: "No investor account is linked to this email.",
        },
        { status: 403 }
      );
    }

    const { data: tradeRows, error: tErr } = await supabase
      .from("trades")
      .select("*");
    if (tErr) throw new Error(`Failed to load trades: ${tErr.message}`);
    const trades = (tradeRows ?? []).map(rowToTrade);

    const month =
      explicitMonth ?? latestMonthWithData(trades) ?? currentMonthKey();

    const report = computeInvestorReport(me, partners, trades, month);
    // Do NOT expose ownership % to investors — combined with their own balance
    // it reveals the fund's total AUM. Strip it from the client payload.
    report.partner.ownershipPct = 0;
    const allTimeNet = computeAllTimeNet(me, partners, trades);

    const { data: txRows, error: txErr } = await supabase
      .from("transactions")
      .select("amount, type, date")
      .eq("investorId", me.id)
      .order("date", { ascending: false });
    if (txErr) {
      console.error("[portal/me] transactions query failed:", txErr.message);
    }
    const transactions = (txRows ?? []).map((t) => ({
      amount: Number(t.amount) || 0,
      type: t.type,
      date: t.date,
    }));

    return Response.json({
      success: true,
      report,
      allTimeNet,
      transactions,
      months: recentMonths(12),
    });
  } catch (err: unknown) {
    const msg =
      err && typeof err === "object" && "message" in err
        ? (err as { message: string }).message
        : "Internal server error";
    return Response.json({ success: false, error: msg }, { status: 500 });
  }
}
