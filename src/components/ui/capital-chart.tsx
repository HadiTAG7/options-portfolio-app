"use client";

import { useRef, useState } from "react";
import { formatCurrency } from "@/lib/utils";

interface Pt {
  label: string; // formatted date, e.g. "20 أبريل 2026"
  value: number; // balance
}

// Interactive line chart for the capital timeline. Hover / touch anywhere
// over it to snap to the nearest snapshot: a marker + a dashed guide
// follow the pointer and a tooltip shows that snapshot's balance + date.
// With no pointer, it rests on the most recent snapshot. Colors come from
// the theme CSS variables, so it works in dark and light.
export function CapitalChart({ points }: { points: Pt[] }) {
  const [active, setActive] = useState<number | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const n = points.length;

  if (n === 0) return null;

  if (n === 1) {
    return (
      <div className="mt-4 flex items-baseline justify-center gap-2">
        <span className="font-mono text-lg font-bold tabular-nums text-on-surface">
          {formatCurrency(points[0].value)}
        </span>
        <span className="text-xs text-on-surface-variant">
          {points[0].label}
        </span>
      </div>
    );
  }

  const W = 100;
  const H = 40;
  const PAD = 3;
  const vals = points.map((p) => p.value);
  const max = Math.max(...vals);
  const min = Math.min(...vals);
  const range = max - min || 1;
  const pts = points.map((p, i) => ({
    x: PAD + (i / (n - 1)) * (W - 2 * PAD),
    y: PAD + (1 - (p.value - min) / range) * (H - 2 * PAD),
  }));
  const line = pts
    .map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(2)},${p.y.toFixed(2)}`)
    .join(" ");
  const area = `${line} L${pts[n - 1].x.toFixed(2)},${H} L${pts[0].x.toFixed(2)},${H} Z`;

  const shown = active ?? n - 1;
  const sp = pts[shown];

  function handleMove(clientX: number) {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const frac = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    setActive(Math.round(frac * (n - 1)));
  }

  return (
    <div
      ref={ref}
      className="relative mt-6 h-32 w-full touch-none select-none"
      onPointerMove={(e) => handleMove(e.clientX)}
      onPointerDown={(e) => handleMove(e.clientX)}
      onPointerLeave={() => setActive(null)}
    >
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        className="h-full w-full overflow-visible"
        role="img"
        aria-label="مخطط خطي لتطور رأس المال"
      >
        <defs>
          <linearGradient id="capFill" x1="0" y1="0" x2="0" y2="1">
            <stop
              offset="0%"
              style={{ stopColor: "var(--color-primary)", stopOpacity: 0.22 }}
            />
            <stop
              offset="100%"
              style={{ stopColor: "var(--color-primary)", stopOpacity: 0 }}
            />
          </linearGradient>
        </defs>
        <path d={area} fill="url(#capFill)" />
        <path
          d={line}
          fill="none"
          strokeWidth={1.75}
          vectorEffect="non-scaling-stroke"
          strokeLinejoin="round"
          strokeLinecap="round"
          style={{ stroke: "var(--color-primary)" }}
        />
        <line
          x1={sp.x}
          y1={0}
          x2={sp.x}
          y2={H}
          strokeWidth={1}
          vectorEffect="non-scaling-stroke"
          strokeDasharray="2 2"
          opacity={0.5}
          style={{ stroke: "var(--color-outline)" }}
        />
      </svg>

      {/* Marker dot on the active point */}
      <div
        className="pointer-events-none absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-primary bg-background"
        style={{ left: `${sp.x}%`, top: `${(sp.y / H) * 100}%` }}
      />

      {/* Tooltip: balance + date */}
      <div
        className="pointer-events-none absolute z-10 whitespace-nowrap rounded-lg border border-outline-variant bg-surface-container-high px-3 py-1.5 text-center shadow-lg"
        style={{
          left: `${Math.min(88, Math.max(12, sp.x))}%`,
          top: `${(sp.y / H) * 100}%`,
          transform: "translate(-50%, calc(-100% - 10px))",
        }}
      >
        <div className="font-mono text-sm font-bold tabular-nums text-on-surface">
          {formatCurrency(points[shown].value)}
        </div>
        <div className="text-[10px] text-on-surface-variant">
          {points[shown].label}
        </div>
      </div>
    </div>
  );
}
