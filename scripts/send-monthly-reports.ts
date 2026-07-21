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
  computePartnerDistributionFromTrades,
  tradeMonthKey,
  tradeProfit,
  tradeProfitDate,
  asEarnedBasis,
} from "../src/lib/partner-profit";
import { getPartnerInvestment, safeNumber } from "../src/lib/utils";
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

ok(`loaded ${partners.length} partners, ${trades.length} trades`);

// ── Statement math — identical to the app's email route ─────────────
const tradesInMonth = trades.filter((t) => tradeMonthKey(t) === month);
const statementPartners = partners.map(asEarnedBasis);
const distribution = computePartnerDistributionFromTrades(
  statementPartners,
  tradesInMonth
);
const totalInvestment = partners.reduce(
  (sum, p) => sum + getPartnerInvestment(p),
  0
);

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
  const dist = distribution[partner.id];
  if (!dist) {
    console.warn(`⏭ ${partner.name}: skipped (no distribution data)`);
    skipped++;
    continue;
  }

  const ownershipShare =
    totalInvestment > 0 ? getPartnerInvestment(partner) / totalInvestment : 0;
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
