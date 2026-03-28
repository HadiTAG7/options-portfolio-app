"use client";

import { Header } from "@/components/layout/header";
import { StatsCards } from "@/components/dashboard/stats-cards";
import { PerformanceChart } from "@/components/dashboard/performance-chart";
import { InvestorBreakdown } from "@/components/dashboard/investor-breakdown";
import { OpenPositions } from "@/components/dashboard/open-positions";
import { RecentTrades } from "@/components/dashboard/recent-trades";
import {
  investors,
  trades,
  portfolioSummary,
  performanceData,
} from "@/data/mock-data";

export default function DashboardPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="flex-1">
        <div className="container mx-auto px-4 py-8 space-y-8">
          {/* Page Title */}
          <div>
            <h2 className="text-3xl font-bold tracking-tight">Dashboard</h2>
            <p className="text-muted-foreground">
              Overview of your shared options portfolio performance
            </p>
          </div>

          {/* Stats Overview Cards */}
          <StatsCards summary={portfolioSummary} />

          {/* Charts + Investor Breakdown */}
          <div className="grid gap-4 lg:grid-cols-3">
            <PerformanceChart data={performanceData} />
            <InvestorBreakdown investors={investors} />
          </div>

          {/* Active Positions Table */}
          <OpenPositions trades={trades} />

          {/* Recent Closed Trades */}
          <RecentTrades trades={trades} />
        </div>
      </main>

      <footer className="border-t py-4">
        <div className="container mx-auto px-4 text-center text-sm text-muted-foreground">
          Options Portfolio Manager &copy; {new Date().getFullYear()} &mdash; Built for shared investment management
        </div>
      </footer>
    </div>
  );
}
