// Money as text in an EXPLICIT currency. The UI formatters in lib/utils
// convert to whatever display currency the device has selected, which is
// right for screens and wrong for anything persisted or computed: a ledger
// note written while the GP's app shows riyals must still say what was
// booked. Use these for stored text and server output.

function amount(n: number): string {
  return Math.abs(n).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

// Negative sign before the symbol; −0 after rounding prints without a sign.
export function fmtUsd(n: number): string {
  const neg = n < 0 && Math.abs(n) >= 0.005;
  return `${neg ? "-" : ""}$${amount(n)}`;
}

export function fmtSar(n: number): string {
  const neg = n < 0 && Math.abs(n) >= 0.005;
  return `${neg ? "-" : ""}${amount(n)} ر.س`;
}
