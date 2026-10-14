// The rate is a per-device setting in the app; the dry run uses the app's
// default unless SAR_PER_USD is provided. Kept separate so the main script
// has no hard-coded number.
import { DEFAULT_SAR_PER_USD } from "@/lib/currency";

export function getSarRateFallback(): number {
  const v = Number(process.env.SAR_PER_USD);
  return Number.isFinite(v) && v > 0 ? v : DEFAULT_SAR_PER_USD;
}
