import type { MonthlyReportData } from "@/lib/report-pdf";
import { formatCurrency } from "@/lib/utils";

// The monthly report rendered as an EMAIL BODY (not a PDF). Unlike the
// print/PDF report — which needs Chromium + web fonts + rich CSS — this
// is email-safe: a max-600px table layout with inline styles, RTL, and
// system fonts, so it renders correctly in Gmail / Outlook / Apple Mail.
// Enqueued into the Firestore `mail` collection and delivered by the
// Firebase "Trigger Email" extension. Numbers are wrapped dir="ltr" so
// currency/percent signs sit on the correct side inside the RTL layout.
export function buildPartnerEmailHtml(data: MonthlyReportData): {
  subject: string;
  html: string;
} {
  const s = data.partnerSummary;
  const GREEN = "#059669";
  const RED = "#dc2626";
  const money = (n: number) => formatCurrency(n);
  const sign = (n: number) => (n >= 0 ? "+" : "");
  const netColor = s.netProfit >= 0 ? GREEN : RED;

  const rows: Array<[string, string, string]> = [
    ["الاستثمار", money(s.investment), "#111827"],
    ["الربح قبل الرسوم", `${sign(s.grossProfit)}${money(s.grossProfit)}`, "#111827"],
    [`الرسوم (${s.feeRatePct.toFixed(0)}%)`, `-${money(s.feeAmount)}`, RED],
    ["صافي الربح", `${sign(s.netProfit)}${money(s.netProfit)}`, netColor],
    [
      "إجمالي الأرباح حتى الآن",
      `${sign(s.cumulativeNetProfit)}${money(s.cumulativeNetProfit)}`,
      s.cumulativeNetProfit >= 0 ? GREEN : RED,
    ],
    ["نسبة العائد", `${sign(s.returnPct)}${s.returnPct.toFixed(2)}%`, "#111827"],
  ];

  const bodyRows = rows
    .map(
      ([label, value, color], i) => `
      <tr>
        <td style="padding:11px 16px;border-bottom:1px solid #eceef1;color:#4b5563;font-size:14px;">${label}</td>
        <td dir="ltr" style="padding:11px 16px;border-bottom:1px solid #eceef1;text-align:left;font-weight:bold;font-size:14px;color:${color};${i === 3 ? "font-size:16px;" : ""}">${value}</td>
      </tr>`
    )
    .join("");

  const positions =
    data.positions.length > 0
      ? `
      <h3 style="margin:24px 0 8px;font-size:14px;color:#111827;font-weight:bold;">الصفقات خلال الشهر</h3>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border:1px solid #eceef1;">
        ${data.positions
          .map(
            (p) => `
          <tr>
            <td style="padding:9px 16px;border-bottom:1px solid #f3f4f6;font-size:13px;color:#4b5563;">${p.ticker} · ${p.type}</td>
            <td dir="ltr" style="padding:9px 16px;border-bottom:1px solid #f3f4f6;text-align:left;font-size:13px;font-weight:bold;color:${p.share >= 0 ? GREEN : RED};">${sign(p.share)}${money(p.share)}</td>
          </tr>`
          )
          .join("")}
      </table>`
      : "";

  const subject = `التقرير الشهري — ${data.periodLabel} — ${data.partner.name}`;

  const html = `<div dir="rtl" style="margin:0;padding:24px 0;background:#f3f4f6;font-family:Tahoma,Arial,'Segoe UI',sans-serif;">
    <div style="max-width:600px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb;">
      <div style="background:#09090b;padding:24px;text-align:center;">
        <div style="color:#ffffff;font-size:20px;font-weight:bold;letter-spacing:0.5px;">AlGhanim Options Desk</div>
        <div style="color:#34d399;font-size:13px;margin-top:6px;">التقرير الشهري · ${data.periodLabel}</div>
      </div>
      <div style="padding:24px;">
        <p style="font-size:15px;color:#111827;margin:0 0 4px;">مرحباً ${data.partner.name}،</p>
        <p style="font-size:12px;color:#6b7280;margin:0 0 20px;">نسبة الملكية ${data.partner.ownershipPct.toFixed(2)}%${data.partner.code ? ` · ${data.partner.code}` : ""}</p>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border:1px solid #eceef1;border-radius:8px;overflow:hidden;">
          ${bodyRows}
        </table>
        ${positions}
        <p style="font-size:11px;color:#9ca3af;margin:28px 0 0;text-align:center;">هذا التقرير سري ومخصص للمستثمر المعني فقط.</p>
      </div>
    </div>
  </div>`;

  return { subject, html };
}
