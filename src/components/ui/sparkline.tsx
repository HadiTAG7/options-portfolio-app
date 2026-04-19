"use client";

import { LineChart, Line, ResponsiveContainer, YAxis } from "recharts";
import { safeNumber } from "@/lib/utils";
import type { BalanceHistoryEntry } from "@/types";

interface SparklineProps {
  data: BalanceHistoryEntry[] | undefined;
  fallbackTrend?: "up" | "down";
  width?: number;
  height?: number;
}

export function Sparkline({
  data,
  fallbackTrend = "up",
  width = 80,
  height = 32,
}: SparklineProps) {
  const cleaned = (data ?? [])
    .map((d) => ({ date: d.date, balance: safeNumber(d.balance) }))
    .filter((d) => Number.isFinite(d.balance));

  // Determine trend from first/last points
  let trend: "up" | "down" = fallbackTrend;
  if (cleaned.length >= 2) {
    trend = cleaned[cleaned.length - 1].balance >= cleaned[0].balance ? "up" : "down";
  }
  const color = trend === "up" ? "var(--color-primary)" : "var(--color-secondary)";

  // If we don't have enough history, show a flat baseline so the row isn't empty
  if (cleaned.length < 2) {
    return (
      <div
        style={{ width, height }}
        className="flex items-center justify-center"
      >
        <div
          className="h-px w-full"
          style={{ background: color, opacity: 0.4 }}
        />
      </div>
    );
  }

  return (
    <div style={{ width, height }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={cleaned} margin={{ top: 2, bottom: 2, left: 0, right: 0 }}>
          <YAxis hide domain={["dataMin", "dataMax"]} />
          <Line
            type="monotone"
            dataKey="balance"
            stroke={color}
            strokeWidth={1.5}
            dot={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
