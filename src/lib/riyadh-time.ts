// The business day is Riyadh's. Riyadh is UTC+3 all year (no daylight
// saving), so a fixed offset is exact and needs no timezone database —
// which also makes it identical in the browser, on Vercel and in scripts.
//
// The money store stamps ledger rows with the UTC date, so anything recorded
// between 00:00 and 03:00 Riyadh time lands on the previous day. New code
// that dates money movements uses these instead.
const RIYADH_OFFSET_MS = 3 * 60 * 60 * 1000;

function riyadhIso(d: Date): string {
  return new Date(d.getTime() + RIYADH_OFFSET_MS).toISOString();
}

// YYYY-MM-DD in Riyadh.
export function riyadhDate(d: Date = new Date()): string {
  return riyadhIso(d).slice(0, 10);
}

// YYYY-MM in Riyadh — the month a funding day belongs to.
export function riyadhMonthKey(d: Date = new Date()): string {
  return riyadhIso(d).slice(0, 7);
}
