// Automatic monthly partner reports — GitHub Actions edition.
//
// Reads partners + trades straight from Firestore (admin SDK), builds
// each partner's PDF with the SAME engine the app uses (settlement-blind
// + entry-date-gated distribution, tradeMonthKey bucketing), and emails
// them via Gmail. Runs from the "Send Monthly Reports" workflow:
//   • scheduled on the 1st of every month → sends the PREVIOUS month
//   • manual runs can pass MONTH (YYYY-MM) and/or PARTNER_ID
//
// Required env:
//   FIREBASE_SERVICE_ACCOUNT   service-account JSON (existing secret)
//   GMAIL_USER                 the sending Gmail address
//   GMAIL_APP_PASSWORD         Google App Password (not the login password)
// Optional env:
//   MONTH        YYYY-MM (default: previous month)
//   PARTNER_ID   send to a single partner only
//
// Run with: npx tsx scripts/send-monthly-reports.ts
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cert, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import nodemailer from "nodemailer";
import { chromium } from "playwright";
import {
  tradeMonthKey,
  tradeProfit,
  tradeProfitDate,
  cumulativeNetForPartner,
  monthlyPartnerDist,
} from "../src/lib/partner-profit";
import { safeNumber } from "../src/lib/utils";
import type {
  MonthlyReportData,
  PartnerPosition,
} from "../src/lib/report-pdf";
import { buildReportsDocument } from "../src/lib/report-html";
import type { Partner, Trade } from "../src/types";

// The report is real HTML/CSS (full Arabic + the app's fonts) rendered
// to PDF by Chromium — fonts embedded as base64 so no network access.
const FONTS_DIR = join(process.cwd(), "public", "fonts");
function fontFace(family: string, weight: string, file: string): string {
  const b64 = readFileSync(join(FONTS_DIR, file)).toString("base64");
  return `@font-face{font-family:"${family}";font-weight:${weight};src:url(data:font/woff2;base64,${b64}) format("woff2")}`;
}
function embeddedFontCss(): string {
  return [
    fontFace("Thmanyah Sans", "400", "thmanyah/thmanyahsans-Regular.woff2"),
    fontFace("Thmanyah Sans", "500", "thmanyah/thmanyahsans-Medium.woff2"),
    fontFace("Thmanyah Sans", "700", "thmanyah/thmanyahsans-Bold.woff2"),
    fontFace(
      "Thmanyah Serif Display",
      "700",
      "thmanyah/thmanyahserifdisplay-Bold.woff2"
    ),
    fontFace(
      "JetBrains Mono",
      "100 800",
      "jetbrains-mono/jetbrains-mono-latin.woff2"
    ),
  ].join("\n");
}

const {
  FIREBASE_SERVICE_ACCOUNT,
  GMAIL_USER,
  GMAIL_APP_PASSWORD,
  MONTH,
  PARTNER_ID,
} = process.env;

const ok = (m: string) => console.log(`✓ ${m}`);
function fail(m: string): never {
  console.error(`✗ ${m}`);
  process.exit(1);
}

if (!FIREBASE_SERVICE_ACCOUNT) fail("FIREBASE_SERVICE_ACCOUNT is required");
if (!GMAIL_USER || !GMAIL_APP_PASSWORD) {
  fail(
    "GMAIL_USER and GMAIL_APP_PASSWORD are required — add them as repository secrets (App Password from myaccount.google.com/apppasswords)"
  );
}

function previousMonthKey(): string {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

const month = MONTH?.trim() || previousMonthKey();
if (!/^\d{4}-\d{2}$/.test(month)) fail(`Invalid MONTH "${month}" — use YYYY-MM`);

// ── Firestore reads (field names identical to the old DB rows) ──────
initializeApp({ credential: cert(JSON.parse(FIREBASE_SERVICE_ACCOUNT)) });
const db = getFirestore();

// tsx runs .ts as CJS in this repo (no "type": "module"), so the whole
// flow lives in main() instead of top-level await.
async function main(): Promise<void> {

/* eslint-disable @typescript-eslint/no-explicit-any */
function rowToPartner(row: any): Partner {
  const currentBalance =
    safeNumber(row.currentBalance) || safeNumber(row.total_balance);
  return {
    id: String(row.id),
    name: row.name,
    code: row.code ?? "",
    email: row.email ?? null,
    initials: row.initials ?? "",
    avatarUrl: row.avatar_url ?? undefined,
    totalBalance: safeNumber(row.total_balance),
    ownershipPercentage: safeNumber(row.ownership_percentage),
    managementFeeRate:
      safeNumber(row.managementFeePercent) ||
      safeNumber(row.management_fee_rate),
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
      ? row.balanceHistory
      : [],
    archivedAt: row.archived_at ?? null,
    gpFeesAccrued: safeNumber(row.gpFeesAccrued),
    profitTakenGross: safeNumber(row.profitTakenGross),
  };
}

const [pSnap, tSnap] = await Promise.all([
  db.collection("partners").get(),
  db.collection("trades").get(),
]);

const partners: Partner[] = pSnap.docs
  .map((d) => rowToPartner(d.data()))
  .filter((p) => !p.archivedAt);

const trades: Trade[] = tSnap.docs.map((d) => {
  const r: any = d.data();
  return {
    id: String(r.id ?? d.id),
    ticker: r.ticker,
    type: r.type,
    quantity: safeNumber(r.quantity),
    premium: safeNumber(r.premium),
    strike: safeNumber(r.strike),
    result: safeNumber(r.result),
    expiration: r.expiration ?? "",
    date: r.date,
    status: r.status ?? "open",
    autoClosed: r.autoClosed ?? false,
    createdAt: r.created_at ?? null,
  } as Trade;
});
/* eslint-enable @typescript-eslint/no-explicit-any */

// Stored (frozen / GP-edited) monthly-profit records win over the live
// compute so emails match exactly what's shown/recorded in the app.
const mpSnap = await db.collection("monthly_profits").get();
const storedByKey = new Map<
  string,
  { gross: number; fee: number; net: number }
>();
const storedNetByPartner: Record<string, Record<string, number>> = {};
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

ok(
  `loaded ${partners.length} partners, ${trades.length} trades, ${mpSnap.size} stored monthly records`
);

// ── Auto-freeze: lock this month's numbers so they never drift ───────
// The log/report recompute each month from TODAY's ownership, so any
// later deposit / withdrawal / capitalization re-splits every past
// month. Freezing writes each partner's computed {gross, fee, net} for
// the report month into monthly_profits ONCE; thereafter the app and
// every report read the stored value instead of recomputing. Guards:
//   • only COMPLETED months freeze (never the in-progress current one),
//   • an existing record (a GP hand-edit or an earlier freeze) is never
//     overwritten — so manual corrections always win.
// This is what makes "الأرقام القديمة تتغير" impossible going forward.
//
// Only the JUST-ENDED month is auto-frozen (month === previous month):
// it hasn't drifted yet, so its live figures are still correct. Older
// months are never auto-frozen — a back-dated manual run would otherwise
// lock a value that has ALREADY drifted; those must be corrected by the
// GP (in-app edit) or are already stored (and stored always wins).
if (month === previousMonthKey()) {
  let frozen = 0;
  for (const p of partners) {
    const key = `${month}__${p.id}`;
    if (storedByKey.has(key)) continue; // preserve edits / prior freeze
    const md = monthlyPartnerDist(partners, trades, p.id, month);
    if (!md) continue;
    const gross = md.grossProfit;
    const fee = md.feeAmount;
    const net = md.netProfit;
    if (gross === 0 && net === 0) continue; // nothing earned that month
    await db.collection("monthly_profits").doc(key).set({
      id: key,
      month,
      partnerId: p.id,
      gross,
      fee,
      net,
      updated_at: new Date().toISOString(),
    });
    storedByKey.set(key, { gross, fee, net });
    (storedNetByPartner[p.id] ??= {})[month] = net;
    frozen++;
  }
  ok(`froze ${frozen} monthly record(s) for ${month} (drift-proof)`);
} else {
  console.log(
    `↷ ${month} is not the just-ended month — not auto-freezing (correct it in-app; stored values always win)`
  );
}

// ── Statement math — identical to the app's email route ─────────────
// Per-partner monthly figures come from monthlyPartnerDist inside the
// loop: each partner weighted by the capital they held THAT month
// (stable, entry-date-gated, settlement-blind).
const tradesInMonth = trades.filter((t) => tradeMonthKey(t) === month);

const targets = PARTNER_ID
  ? partners.filter((p) => p.id === PARTNER_ID)
  : partners;
if (PARTNER_ID && targets.length === 0) fail(`Partner ${PARTNER_ID} not found`);

const [y, m] = month.split("-");
const periodLabel = new Date(Number(y), Number(m) - 1).toLocaleString(
  "en-US",
  { month: "long", year: "numeric" }
);

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: { user: GMAIL_USER, pass: GMAIL_APP_PASSWORD },
});

const fontCss = embeddedFontCss();
const browser = await chromium.launch();
const page = await browser.newPage();

async function renderPdf(report: MonthlyReportData): Promise<Buffer> {
  await page.setContent(buildReportsDocument([report], fontCss), {
    waitUntil: "networkidle",
  });
  return page.pdf({ format: "A4", printBackground: true });
}

let sent = 0;
let skipped = 0;
let errors = 0;

for (const partner of targets) {
  if (!partner.email) {
    console.warn(`⏭ ${partner.name}: skipped (no email)`);
    skipped++;
    continue;
  }
  const md = monthlyPartnerDist(partners, trades, partner.id, month);
  const st = storedByKey.get(`${month}__${partner.id}`);
  if (!md && !st) {
    console.warn(`⏭ ${partner.name}: skipped (no distribution data)`);
    skipped++;
    continue;
  }

  // Stored (frozen/edited) value wins; live compute is the fallback.
  const gross = st?.gross ?? md?.grossProfit ?? 0;
  const fee = st?.fee ?? md?.feeAmount ?? 0;
  const net = st?.net ?? md?.netProfit ?? 0;
  const investment = md?.investment ?? 0;
  const returnPct = investment > 0 ? (net / investment) * 100 : 0;

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
    const pdfBuffer = await renderPdf(reportData);
    await transporter.sendMail({
      from: `"AlGhanim Options Desk" <${GMAIL_USER}>`,
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
          filename: `report-${month}-${partner.code || partner.name}.pdf`,
          content: pdfBuffer,
          contentType: "application/pdf",
        },
      ],
    });
    ok(`sent → ${partner.name} <${partner.email}>`);
    sent++;
  } catch (err) {
    console.error(`✗ ${partner.name}: send failed —`, err);
    errors++;
  }
}

  await browser.close();
  console.log("──────────────────────");
  console.log(
    `month ${month}: sent ${sent}, skipped ${skipped}, errors ${errors}`
  );
  if (errors > 0) process.exit(1);
  ok("REPORTS SENT");
}

main().catch((e) => {
  console.error("✗ send-monthly-reports failed:", e);
  process.exit(1);
});
