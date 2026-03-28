"use client";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Progress } from "@/components/ui/progress";
import { formatCurrency } from "@/lib/utils";
import type { Investor } from "@/types";

interface InvestorBreakdownProps {
  investors: Investor[];
}

const avatarColors = [
  "bg-blue-500",
  "bg-violet-500",
  "bg-amber-500",
  "bg-emerald-500",
  "bg-rose-500",
  "bg-cyan-500",
];

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase();
}

export function InvestorBreakdown({ investors }: InvestorBreakdownProps) {
  const totalCapital = investors.reduce((sum, inv) => sum + inv.initialCapital, 0);

  return (
    <Card className="col-span-full lg:col-span-1">
      <CardHeader>
        <CardTitle>Investor Breakdown</CardTitle>
        <CardDescription>
          Capital contributions and profit allocation
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {investors.map((investor, index) => (
          <div key={investor.id} className="space-y-2">
            <div className="flex items-center gap-3">
              <Avatar className="h-9 w-9">
                <AvatarFallback
                  className={`${avatarColors[index % avatarColors.length]} text-white text-xs`}
                >
                  {getInitials(investor.name)}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium truncate">{investor.name}</p>
                  <p className="text-sm font-semibold">{investor.equityPercentage}%</p>
                </div>
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>Invested: {formatCurrency(investor.initialCapital)}</span>
                  <span
                    className={
                      investor.totalProfit >= 0
                        ? "text-emerald-600 dark:text-emerald-400"
                        : "text-red-600 dark:text-red-400"
                    }
                  >
                    {investor.totalProfit >= 0 ? "+" : ""}
                    {formatCurrency(investor.totalProfit)}
                  </span>
                </div>
              </div>
            </div>
            <Progress value={(investor.initialCapital / totalCapital) * 100} />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Current Balance</span>
              <span className="font-medium text-foreground">
                {formatCurrency(investor.currentBalance)}
              </span>
            </div>
          </div>
        ))}

        <div className="border-t pt-4 mt-4">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Total Capital</span>
            <span className="font-bold">{formatCurrency(totalCapital)}</span>
          </div>
          <div className="flex justify-between text-sm mt-1">
            <span className="text-muted-foreground">Total Profit</span>
            <span className="font-bold text-emerald-600 dark:text-emerald-400">
              {formatCurrency(investors.reduce((sum, inv) => sum + inv.totalProfit, 0))}
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
