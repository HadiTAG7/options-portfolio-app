import { type NextRequest } from "next/server";
import { serviceClient, authedEmail } from "@/lib/supabase-server";
import {
  rowToPartner,
  rowToTrade,
  computeInvestorReport,
  findPartnerByEmail,
} from "@/lib/portal-data";
import { generatePartnerReportPDF } from "@/lib/report-pdf";

// Returns the authenticated investor's OWN monthly report as a PDF download.
// Same server-side computation as the emailed report, scoped to the caller.
export async function GET(request: NextRequest) {
  try {
    const email = await authedEmail(request);
    if (!email) {
      return Response.json(
        { success: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    const month = request.nextUrl.searchParams.get("month");
    if (!month || !/^\d{4}-\d{2}$/.test(month)) {
      return Response.json(
        { success: false, error: "Invalid month format. Use YYYY-MM." },
        { status: 400 }
      );
    }

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

    const reportData = computeInvestorReport(me, partners, trades, month);
    const pdf = generatePartnerReportPDF(reportData);

    // Keep the filename ASCII-safe for the Content-Disposition header.
    const safe = (me.code || "investor").replace(/[^\w.-]/g, "_");
    const filename = `report-${month}-${safe}.pdf`;

    return new Response(new Uint8Array(pdf), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (err: unknown) {
    const msg =
      err && typeof err === "object" && "message" in err
        ? (err as { message: string }).message
        : "Internal server error";
    return Response.json({ success: false, error: msg }, { status: 500 });
  }
}
