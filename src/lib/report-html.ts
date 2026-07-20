// HTML monthly-report template — the SINGLE design used by both
// delivery paths:
//   • the "Send Monthly Reports" workflow renders it to PDF with a real
//     browser engine (Playwright/Chromium), then emails it
//   • the in-app download button opens it as a print view
// Real HTML/CSS means full Arabic shaping + RTL + the app's own fonts
// and identity — everything jsPDF could not do.
import type { MonthlyReportData } from "./report-pdf";

// Arabic labels for the trade types partners see.
function typeLabel(type: string): { ar: string; en: string } {
  switch (type) {
    case "Sell Put":
      return { ar: "تأمين نقدي", en: "Cash-Secured Put" };
    case "Sell Call":
      return { ar: "بيع مغطى", en: "Covered Call" };
    case "Stock Sell":
      return { ar: "بيع سهم", en: "Stock Sale" };
    case "Dividend":
      return { ar: "توزيعات أرباح", en: "Dividend" };
    default:
      return { ar: type, en: "" };
  }
}

const AR_MONTHS = [
  "يناير",
  "فبراير",
  "مارس",
  "أبريل",
  "مايو",
  "يونيو",
  "يوليو",
  "أغسطس",
  "سبتمبر",
  "أكتوبر",
  "نوفمبر",
  "ديسمبر",
];

function arPeriod(periodKey: string): string {
  const [y, m] = periodKey.split("-");
  const idx = Number(m) - 1;
  return AR_MONTHS[idx] ? `${AR_MONTHS[idx]} ${y}` : periodKey;
}

function money(n: number): string {
  const sign = n < 0 ? "−" : "";
  return `${sign}$${Math.abs(n).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// @font-face CSS for the APP (print view): same-origin /fonts URLs.
// The Actions script builds its own base64 variant (needs fs).
export function appFontFaceCss(): string {
  return `
  @font-face{font-family:"Thmanyah Sans";font-weight:400;src:url("/fonts/thmanyah/thmanyahsans-Regular.woff2") format("woff2")}
  @font-face{font-family:"Thmanyah Sans";font-weight:500;src:url("/fonts/thmanyah/thmanyahsans-Medium.woff2") format("woff2")}
  @font-face{font-family:"Thmanyah Sans";font-weight:700;src:url("/fonts/thmanyah/thmanyahsans-Bold.woff2") format("woff2")}
  @font-face{font-family:"Thmanyah Serif Display";font-weight:700;src:url("/fonts/thmanyah/thmanyahserifdisplay-Bold.woff2") format("woff2")}
  @font-face{font-family:"JetBrains Mono";font-weight:100 800;src:url("/fonts/jetbrains-mono/jetbrains-mono-latin.woff2") format("woff2")}
  `;
}

// One partner's report as a full A4 page (the caller wraps pages into a
// document via buildReportsDocument).
function reportPage(data: MonthlyReportData): string {
  const s = data.partnerSummary;
  const positive = s.netProfit >= 0;
  const rows = data.positions
    .map((p, i) => {
      const t = typeLabel(p.type);
      const pos = p.share >= 0;
      return `<tr>
        <td class="idx">${i + 1}</td>
        <td class="ticker">${esc(p.ticker)}</td>
        <td><span class="type-ar">${t.ar}</span><span class="type-en">${t.en}</span></td>
        <td class="num ${pos ? "up" : "down"}">${pos ? "+" : ""}${money(p.share)}</td>
      </tr>`;
    })
    .join("");

  return `
  <section class="page">
    <!-- Header band -->
    <header class="band">
      <div class="band-right">
        <h1 class="report-title">التقرير الشهري</h1>
        <p class="period">${arPeriod(data.periodKey)} · <bdi dir="ltr">${esc(data.periodLabel)}</bdi></p>
      </div>
      <div class="band-left">
        <p class="logotype">ALGHANIM OPTIONS DESK</p>
        <p class="logosub">PROPRIETARY TRADING DESK</p>
      </div>
      <div class="band-glow"></div>
    </header>

    <!-- Partner strip -->
    <div class="partner-strip">
      <div>
        <p class="lbl">الشريك · PARTNER</p>
        <p class="partner-name">${esc(data.partner.name)}</p>
      </div>
      <div class="partner-balance">
        <p class="lbl">الرصيد الحالي · CURRENT BALANCE</p>
        <p class="balance mono">${money(s.currentBalance)}</p>
      </div>
    </div>

    <!-- Summary tiles -->
    <div class="tiles">
      <div class="tile">
        <p class="lbl">رأس المال المستثمر</p>
        <p class="val mono">${money(s.investment)}</p>
        <p class="sub">INVESTMENT</p>
      </div>
      <div class="tile">
        <p class="lbl">الربح الإجمالي</p>
        <p class="val mono ${s.grossProfit >= 0 ? "up" : "down"}">${s.grossProfit >= 0 ? "+" : ""}${money(s.grossProfit)}</p>
        <p class="sub">GROSS PROFIT</p>
      </div>
      <div class="tile">
        <p class="lbl">رسوم الأداء (${s.feeRatePct.toFixed(0)}٪)</p>
        <p class="val mono fee">${money(s.feeAmount)}</p>
        <p class="sub">PERFORMANCE FEE</p>
      </div>
      <div class="tile accent ${positive ? "" : "neg"}">
        <p class="lbl">صافي الربح</p>
        <p class="val mono ${positive ? "up" : "down"}">${positive ? "+" : ""}${money(s.netProfit)}</p>
        <p class="sub">NET · ${s.returnPct >= 0 ? "+" : ""}${s.returnPct.toFixed(2)}%</p>
      </div>
    </div>

    <!-- Positions -->
    <div class="positions">
      <div class="sec-title">
        <span class="tick"></span>
        <h2>حصتك من صفقات الشهر</h2>
        <span class="sec-en">YOUR SHARE OF THIS MONTH'S TRADES</span>
      </div>
      ${
        data.positions.length === 0
          ? `<p class="empty">لا توجد صفقات محتسبة لهذا الشهر</p>`
          : `<table>
        <thead>
          <tr><th class="idx">#</th><th>الرمز</th><th>النوع</th><th class="num">حصتك من الربح</th></tr>
        </thead>
        <tbody>${rows}</tbody>
        <tfoot>
          <tr>
            <td colspan="3">الإجمالي قبل رسوم الأداء</td>
            <td class="num ${s.grossProfit >= 0 ? "up" : "down"}">${s.grossProfit >= 0 ? "+" : ""}${money(s.grossProfit)}</td>
          </tr>
        </tfoot>
      </table>`
      }
    </div>

    <!-- Fee note -->
    <div class="note">
      تُحتسب أرباحك على الصفقات المغلقة بعد تاريخ انضمامك فقط، وتُخصم رسوم
      الأداء (${s.feeRatePct.toFixed(0)}٪) من الربح الإجمالي عند التسوية.
    </div>

    <footer class="foot">
      <span>هذا التقرير سري وموجّه للشريك المذكور فقط · CONFIDENTIAL</span>
      <span class="mono">${esc(data.periodKey)}</span>
    </footer>
  </section>`;
}

// Full printable document: one page per partner report.
export function buildReportsDocument(
  reports: MonthlyReportData[],
  fontFaceCss: string
): string {
  const pages = reports.map(reportPage).join("\n");
  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8"/>
<title>Monthly Reports</title>
<style>
${fontFaceCss}
  :root{
    --ink:#101318; --muted:#6b7280; --faint:#9aa3ae;
    --line:#e6e8ec; --stripe:#f6f7f9;
    --emerald:#047857; --emerald-bright:#10b981;
    --rose:#be123c; --amber:#b45309;
    --band:#0b0d10; --band2:#161a1f;
  }
  *{margin:0;padding:0;box-sizing:border-box}
  html,body{background:#fff}
  body{font-family:"Thmanyah Sans",system-ui,sans-serif;color:var(--ink)}
  .mono{font-family:"JetBrains Mono",monospace;font-variant-numeric:tabular-nums}
  .up{color:var(--emerald)} .down{color:var(--rose)} .fee{color:var(--amber)}

  .page{width:210mm;min-height:297mm;padding:0 0 14mm;position:relative;page-break-after:always;background:#fff}
  .page:last-child{page-break-after:auto}

  /* Header band */
  .band{position:relative;display:flex;justify-content:space-between;align-items:center;
    background:linear-gradient(120deg,var(--band2),var(--band) 55%);color:#fff;
    padding:12mm 14mm 10mm;overflow:hidden;border-bottom:1mm solid var(--emerald-bright)}
  .band-glow{position:absolute;top:-30mm;left:-10mm;width:80mm;height:80mm;border-radius:50%;
    background:radial-gradient(circle,rgba(16,185,129,.25),transparent 70%)}
  .report-title{font-size:24pt;font-weight:700;letter-spacing:.5px}
  .period{margin-top:2mm;font-size:11pt;color:#9ee8c9}
  .band-left{text-align:left;position:relative;z-index:1}
  .logotype{font-family:"Thmanyah Serif Display",serif;font-weight:700;font-size:13pt;letter-spacing:2px}
  .logosub{margin-top:1mm;font-size:6.5pt;letter-spacing:3.5px;color:#8b949e}

  /* Partner strip */
  .partner-strip{display:flex;justify-content:space-between;align-items:flex-end;
    padding:8mm 14mm 0}
  .lbl{font-size:6.5pt;letter-spacing:1.5px;color:var(--faint);font-weight:700;text-transform:uppercase}
  .partner-name{font-size:16pt;font-weight:700;margin-top:1.5mm}
  .partner-balance{text-align:left}
  .balance{font-size:15pt;font-weight:700;margin-top:1.5mm}

  /* Tiles */
  .tiles{display:grid;grid-template-columns:repeat(4,1fr);gap:4mm;padding:7mm 14mm 0}
  .tile{border:.35mm solid var(--line);border-radius:2.5mm;padding:4.5mm 4mm 3.5mm;text-align:center}
  .tile .val{font-size:12.5pt;font-weight:700;margin-top:2mm}
  .tile .sub{margin-top:1.5mm;font-size:6pt;letter-spacing:1.2px;color:var(--faint);font-weight:700}
  .tile.accent{border-color:var(--emerald-bright);background:#f2fbf7;box-shadow:inset 0 0 0 .35mm var(--emerald-bright)}
  .tile.accent.neg{border-color:var(--rose);background:#fdf3f5;box-shadow:inset 0 0 0 .35mm var(--rose)}

  /* Positions */
  .positions{padding:8mm 14mm 0}
  .sec-title{display:flex;align-items:center;gap:3mm;margin-bottom:4mm}
  .tick{width:2mm;height:5mm;border-radius:1mm;background:var(--emerald-bright)}
  .sec-title h2{font-size:12pt;font-weight:700}
  .sec-en{font-size:6.5pt;letter-spacing:1.5px;color:var(--faint);font-weight:700;margin-right:auto}
  table{width:100%;border-collapse:collapse}
  /* letter-spacing breaks Arabic letter joining — keep headers plain */
  thead th{font-size:8pt;color:var(--muted);font-weight:700;
    text-align:right;padding:2.8mm 3mm;border-bottom:.5mm solid var(--ink)}
  tbody td{padding:2.8mm 3mm;font-size:9.5pt;border-bottom:.25mm solid var(--line);text-align:right}
  tbody tr:nth-child(even){background:var(--stripe)}
  .idx{width:8mm;color:var(--faint);font-size:8pt}
  .ticker{font-family:"JetBrains Mono",monospace;font-weight:700;letter-spacing:.5px}
  .type-ar{font-weight:500}
  .type-en{display:block;font-size:6.5pt;letter-spacing:1px;color:var(--faint)}
  .num{font-family:"JetBrains Mono",monospace;font-variant-numeric:tabular-nums;font-weight:700;text-align:left!important}
  thead th.num{text-align:left}
  tfoot td{padding:3.2mm 3mm;font-weight:700;font-size:10pt;border-top:.6mm solid var(--ink)}
  .empty{padding:10mm;text-align:center;color:var(--faint);border:.35mm dashed var(--line);border-radius:2.5mm}

  /* Note + footer */
  .note{margin:7mm 14mm 0;padding:4mm 5mm;border-right:1.2mm solid var(--emerald-bright);
    background:#f4faf7;border-radius:1.5mm;font-size:8.5pt;color:#374151;line-height:1.9}
  .foot{position:absolute;bottom:8mm;right:14mm;left:14mm;display:flex;justify-content:space-between;
    padding-top:3mm;border-top:.25mm solid var(--line);font-size:6.5pt;letter-spacing:1px;color:var(--faint);font-weight:700}

  @page{size:A4;margin:0}
  @media print{ .page{width:auto;min-height:auto} }
</style>
</head>
<body>
${pages}
</body>
</html>`;
}
