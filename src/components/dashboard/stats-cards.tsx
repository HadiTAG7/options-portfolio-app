"use client";

import {
  DollarSign,
  Wallet,
  TrendingUp,
  BarChart3,
  Target,
  PieChart,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency, formatPercent } from "@/lib/utils";
import type { PortfolioSummary } from "@/types";

interface StatsCardsProps {
  summary: PortfolioSummary;
}

export function StatsCards({ summary }: StatsCardsProps) {
  const stats = [
    {
      title: "Portfolio Value",
      value: formatCurrency(summary.totalPortfolioValue),
      description: `${formatPercent(summary.monthlyReturn)} this month`,
      icon: DollarSign,
      trend: "up" as const,
    },
    {
      title: "Cash Available",
      value: formatCurrency(summary.totalCashAvailable),
      description: `${((summary.totalCashAvailable / summary.totalPortfolioValue) * 100).toFixed(1)}% of portfolio`,
      icon: Wallet,
      trend: "neutral" as const,
    },
    {
      title: "Premium Collected",
      value: formatCurrency(summary.totalPremiumCollected),
      description: `From ${summary.openPositionsCount + summary.closedTradesCount} total trades`,
      icon: TrendingUp,
      trend: "up" as const,
    },
    {
      title: "Realized P&L",
      value: formatCurrency(summary.totalRealizedPnL),
      description: `${summary.winRate}% win rate`,
      icon: BarChart3,
      trend: summary.totalRealizedPnL >= 0 ? ("up" as const) : ("down" as const),
    },
    {
      title: "Open Positions",
      value: summary.openPositionsCount.toString(),
      description: `${summary.closedTradesCount} closed trades`,
      icon: Target,
      trend: "neutral" as const,
    },
    {
      title: "Monthly Return",
      value: formatPercent(summary.monthlyReturn),
      description: "Current month performance",
      icon: PieChart,
      trend: summary.monthlyReturn >= 0 ? ("up" as const) : ("down" as const),
    },
  ];

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {stats.map((stat) => (
        <Card key={stat.title}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {stat.title}
            </CardTitle>
            <stat.icon className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stat.value}</div>
            <p
              className={`text-xs mt-1 ${
                stat.trend === "up"
                  ? "text-emerald-600 dark:text-emerald-400"
                  : stat.trend === "down"
                    ? "text-red-600 dark:text-red-400"
                    : "text-muted-foreground"
              }`}
            >
              {stat.description}
            </p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
