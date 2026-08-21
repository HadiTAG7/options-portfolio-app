// Pure performance-metric math over a MONTHLY return series expressed in
// percent (4.43 means +4.43%). No React, no fetching — just formulas, so
// the numbers the metrics tab shows can be reasoned about (and tested) in
// isolation.
//
// Two ground rules keep the comparison fair:
//   • Every column is computed over the SAME months (the fund's active
//     months). A 12-month benchmark Sharpe next to a 4-month fund Sharpe
//     would not be a comparison.
//   • Missing months are SKIPPED, never treated as 0 — a 0 would read as
//     "flat month" and quietly distort every statistic.

export interface SeriesMetrics {
  // How many months actually carried a value — the honesty denominator.
  n: number;
  cumulativePct: number | null;
  // (1+cumulative)^(12/n) − 1: what this pace would compound to over a
  // year. With few months it is an extrapolation, and the UI says so.
  cagrPct: number | null;
  meanMonthlyPct: number | null;
  bestMonthPct: number | null;
  bestMonthKey: string | null;
  worstMonthPct: number | null;
  worstMonthKey: string | null;
  winRatePct: number | null;
  // Sample (n−1) stdev of monthly returns × √12. Needs n ≥ 2.
  annualVolPct: number | null;
  // Largest peak-to-trough fall of the compounded curve. ≤ 0.
  maxDrawdownPct: number | null;
  sharpe: number | null;
  sortino: number | null;
  calmar: number | null;
}

export interface RelativeMetrics {
  // Months where BOTH series had a value — pairwise stats use only these.
  n: number;
  beta: number | null;
  // Jensen's alpha: mean fund return minus what beta exposure to the
  // benchmark explains, monthly ×12, in percent.
  alphaAnnualPct: number | null;
  correlation: number | null;
  // Mean active return ÷ tracking error, annualized ×√12.
  informationRatio: number | null;
}

// Geometric de-annualization: the monthly rate that compounds to the
// annual one, not annual/12.
export function monthlyRiskFree(rfAnnualPct: number): number {
  return Math.pow(1 + rfAnnualPct / 100, 1 / 12) - 1;
}

const EMPTY: SeriesMetrics = {
  n: 0,
  cumulativePct: null,
  cagrPct: null,
  meanMonthlyPct: null,
  bestMonthPct: null,
  bestMonthKey: null,
  worstMonthPct: null,
  worstMonthKey: null,
  winRatePct: null,
  annualVolPct: null,
  maxDrawdownPct: null,
  sharpe: null,
  sortino: null,
  calmar: null,
};

export function computeSeriesMetrics(
  returnsPct: (number | null)[],
  monthKeys: string[],
  rfAnnualPct: number
): SeriesMetrics {
  const pts: { key: string; r: number }[] = [];
  returnsPct.forEach((v, i) => {
    if (v !== null && Number.isFinite(v)) {
      pts.push({ key: monthKeys[i] ?? "", r: v / 100 });
    }
  });
  const n = pts.length;
  if (n === 0) return EMPTY;

  const rs = pts.map((p) => p.r);
  const mean = rs.reduce((s, r) => s + r, 0) / n;
  const cumFactor = rs.reduce((f, r) => f * (1 + r), 1);
  const cumulativePct = (cumFactor - 1) * 100;
  const cagrPct =
    cumFactor > 0 ? (Math.pow(cumFactor, 12 / n) - 1) * 100 : null;

  // Sample stdev — n−1, so a 2-month series is honest about how little it
  // knows instead of understating the spread.
  let sd: number | null = null;
  if (n >= 2) {
    const variance = rs.reduce((s, r) => s + (r - mean) ** 2, 0) / (n - 1);
    sd = Math.sqrt(variance);
  }
  const rfM = monthlyRiskFree(rfAnnualPct);
  const annualVolPct = sd !== null ? sd * Math.sqrt(12) * 100 : null;
  const sharpe = sd !== null && sd > 0 ? ((mean - rfM) / sd) * Math.sqrt(12) : null;

  // Sortino: same excess return, but the denominator only counts months
  // BELOW the risk-free target (full-sample denominator, the standard
  // form). No down months → the ratio is undefined, not infinite.
  const downside = Math.sqrt(
    rs.reduce((s, r) => s + Math.min(0, r - rfM) ** 2, 0) / n
  );
  const sortino =
    downside > 0 ? ((mean - rfM) / downside) * Math.sqrt(12) : null;

  // Max drawdown on the compounded equity curve, tracking the running peak.
  let peak = 1;
  let equity = 1;
  let maxDD = 0;
  for (const r of rs) {
    equity *= 1 + r;
    if (equity > peak) peak = equity;
    const dd = equity / peak - 1;
    if (dd < maxDD) maxDD = dd;
  }
  const maxDrawdownPct = maxDD * 100;
  const calmar =
    cagrPct !== null && maxDD < 0 ? cagrPct / 100 / Math.abs(maxDD) : null;

  const winRatePct = (rs.filter((r) => r > 0).length / n) * 100;
  let best = pts[0];
  let worst = pts[0];
  for (const p of pts) {
    if (p.r > best.r) best = p;
    if (p.r < worst.r) worst = p;
  }

  return {
    n,
    cumulativePct,
    cagrPct,
    meanMonthlyPct: mean * 100,
    bestMonthPct: best.r * 100,
    bestMonthKey: best.key,
    worstMonthPct: worst.r * 100,
    worstMonthKey: worst.key,
    winRatePct,
    annualVolPct,
    maxDrawdownPct,
    sharpe,
    sortino,
    calmar,
  };
}

export function computeRelativeMetrics(
  fundPct: (number | null)[],
  benchPct: (number | null)[],
  rfAnnualPct: number
): RelativeMetrics {
  const f: number[] = [];
  const b: number[] = [];
  const len = Math.min(fundPct.length, benchPct.length);
  for (let i = 0; i < len; i++) {
    const x = fundPct[i];
    const y = benchPct[i];
    if (x !== null && y !== null && Number.isFinite(x) && Number.isFinite(y)) {
      f.push(x / 100);
      b.push(y / 100);
    }
  }
  const n = f.length;
  if (n < 2) {
    return {
      n,
      beta: null,
      alphaAnnualPct: null,
      correlation: null,
      informationRatio: null,
    };
  }

  const mf = f.reduce((s, r) => s + r, 0) / n;
  const mb = b.reduce((s, r) => s + r, 0) / n;
  let cov = 0;
  let vf = 0;
  let vb = 0;
  for (let i = 0; i < n; i++) {
    cov += (f[i] - mf) * (b[i] - mb);
    vf += (f[i] - mf) ** 2;
    vb += (b[i] - mb) ** 2;
  }
  cov /= n - 1;
  vf /= n - 1;
  vb /= n - 1;

  const beta = vb > 0 ? cov / vb : null;
  const rfM = monthlyRiskFree(rfAnnualPct);
  const alphaAnnualPct =
    beta === null ? null : (mf - (rfM + beta * (mb - rfM))) * 12 * 100;
  const correlation =
    vf > 0 && vb > 0 ? cov / Math.sqrt(vf * vb) : null;

  // Information ratio over the active (fund − benchmark) series.
  const active = f.map((r, i) => r - b[i]);
  const ma = active.reduce((s, r) => s + r, 0) / n;
  const va = active.reduce((s, r) => s + (r - ma) ** 2, 0) / (n - 1);
  const te = Math.sqrt(va);
  const informationRatio = te > 0 ? (ma / te) * Math.sqrt(12) : null;

  return { n, beta, alphaAnnualPct, correlation, informationRatio };
}
