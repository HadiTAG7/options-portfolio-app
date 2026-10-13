import type { MonthlyReportData } from "@/lib/report-pdf";
import { getDisplayCurrency, toDisplayAmount } from "@/lib/currency";

// The monthly report as a WhatsApp message. Built from the SAME
// MonthlyReportData the email and the PDF use, so the three can never
// show different numbers. The app only composes the text and opens
// WhatsApp with it prefilled; the GP presses send. No WhatsApp API, no
// third-party service, no credentials.

// Gregorian month names. toLocaleString("ar-SA") falls back to the Hijri
// calendar on some devices, which must never reach a partner's report.
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

export function arabicMonthLabel(periodKey: string): string {
  const [y, m] = periodKey.split("-").map(Number);
  if (!y || !m) return periodKey;
  return `${AR_MONTHS[m - 1] ?? m} ${y}`;
}

const AR_WEEKDAYS = [
  "الأحد",
  "الاثنين",
  "الثلاثاء",
  "الأربعاء",
  "الخميس",
  "الجمعة",
  "السبت",
];

// "الخميس 23 أكتوبر" for a YYYY-MM-DD date. Computed in UTC so the
// weekday can't slide by one in a timezone west of the date line.
export function arabicDayLabel(iso: string): string | null {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  if (!y || !m || !d) return null;
  const weekday = AR_WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  return `${weekday} ${d} ${AR_MONTHS[m - 1] ?? m}`;
}

// Left-to-right marks around every figure. WhatsApp renders the message
// right-to-left, and without them the bidi algorithm moves the sign and
// the closing parenthesis to the wrong end ("(+3.50%" … ")"). LRM is
// invisible and supported on every WhatsApp client.
const LRM = "‎";
const ltr = (s: string) => `${LRM}${s}${LRM}`;

// Money as plain text in the app's current display currency. Plain
// symbols only: the new riyal sign (U+20C0) renders through a font the
// app ships, which a recipient's phone does not have. The riyal suffix
// stays OUTSIDE the LTR run so it reads after the number in Arabic.
function money(usd: number, signed = false): string {
  const v = toDisplayAmount(usd);
  const zero = Math.abs(v) < 0.005;
  const abs = Math.abs(v).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  const sign = zero ? "" : v < 0 ? "-" : signed ? "+" : "";
  return getDisplayCurrency() === "SAR"
    ? `${ltr(`${sign}${abs}`)} ر.س`
    : ltr(`${sign}$${abs}`);
}

function pct(amount: number, base: number): string {
  if (base <= 0) return "";
  const p = (amount / base) * 100;
  const sign = Math.abs(p) < 0.005 ? "" : p > 0 ? "+" : "";
  return ` ${ltr(`(${sign}${p.toFixed(2)}%)`)}`;
}

export interface WhatsAppMessageOptions {
  // Flips the fee line: an LP pays the performance fee, the GP collects
  // it (the GP's net is gross PLUS the LP fees).
  isManager?: boolean;
  // YYYY-MM-DD chosen by the GP. When set, the message asks for any
  // deposit or withdrawal request before that day; empty leaves it out.
  requestDeadline?: string | null;
}

export function buildWhatsAppMessage(
  data: MonthlyReportData,
  { isManager = false, requestDeadline = null }: WhatsAppMessageOptions = {}
): string {
  const s = data.partnerSummary;
  const month = `*${arabicMonthLabel(data.periodKey)}*`;
  // No rate in the label: the fee rate is the same every month and the
  // partner already knows it — the amount is what this month changes.
  const feeLine = isManager
    ? `عمولة الإدارة المحصّلة: ${money(s.feeAmount, true)}`
    : `الرسوم: ${money(-s.feeAmount)}`;
  // A profitable month opens with praise and thanks to God. A flat or
  // losing month gets the plain header — never praise attached to a loss
  // line by template accident.
  const intro =
    s.netProfit > 0.005
      ? `نحمد الله ونشكره على ما تحقق من أرباح في شهر ${month}، وهذا ملخص التقرير:`
      : `تقرير شهر ${month}:`;
  const deadline = requestDeadline ? arabicDayLabel(requestDeadline) : null;

  const lines = [
    `السلام عليكم ${data.partner.name}،`,
    ``,
    intro,
    ``,
    `مبلغ الاستثمار: ${money(s.investment)}`,
    `الربح قبل الرسوم: ${money(s.grossProfit, true)}${pct(s.grossProfit, s.investment)}`,
    feeLine,
    `*صافي الربح:* ${money(s.netProfit, true)}${pct(s.netProfit, s.investment)}`,
    `إجمالي الأرباح حتى الآن: ${money(s.cumulativeNetProfit, true)}`,
    ``,
  ];
  if (deadline) {
    lines.push(
      `في حال الرغبة في الإيداع أو السحب، نأمل إبلاغنا قبل يوم ${deadline}.`,
      ``
    );
  }
  lines.push(`التقرير التفصيلي مرسل على بريدك الإلكتروني.`);
  return lines.join("\n");
}

// Normalise whatever the GP typed into the digits wa.me expects
// (international format, no "+", no leading zeros). Saudi local formats
// are the common case: 05XXXXXXXX and 5XXXXXXXX become 9665XXXXXXXX.
// Returns null when it can't be a real number, so the caller falls back
// to WhatsApp's contact picker instead of opening a chat with a stranger.
export function normalizeWhatsAppPhone(
  raw: string | null | undefined
): string | null {
  if (!raw) return null;
  let d = raw.trim().replace(/[^\d+]/g, "");
  if (d.startsWith("+")) d = d.slice(1);
  else if (d.startsWith("00")) d = d.slice(2);
  else if (/^05\d{8}$/.test(d)) d = `966${d.slice(1)}`;
  else if (/^5\d{8}$/.test(d)) d = `966${d}`;
  d = d.replace(/\D/g, "");
  // A leading 0 surviving to here is a mistyped local number (e.g. a
  // Saudi 05… with digits missing) — no international number starts
  // with 0, and guessing the country would message the wrong person.
  if (d.startsWith("0")) return null;
  return d.length >= 8 && d.length <= 15 ? d : null;
}

// wa.me opens the WhatsApp app on a phone and WhatsApp Web/Desktop on a
// computer, with the text prefilled. Without a number it opens the
// contact picker, so a partner with no saved number still works.
export function whatsAppLink(phone: string | null, text: string): string {
  const q = `text=${encodeURIComponent(text)}`;
  return phone ? `https://wa.me/${phone}?${q}` : `https://wa.me/?${q}`;
}
