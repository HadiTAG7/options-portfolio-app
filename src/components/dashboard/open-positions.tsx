"use client";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatCurrency, formatDate } from "@/lib/utils";
import type { OptionTrade } from "@/types";

interface OpenPositionsProps {
  trades: OptionTrade[];
}

function getStrategyLabel(strategy: string): string {
  switch (strategy) {
    case "COVERED_CALL":
      return "Covered Call";
    case "CASH_SECURED_PUT":
      return "Cash-Secured Put";
    case "WHEEL":
      return "Wheel";
    default:
      return strategy;
  }
}

function getStatusBadge(status: string) {
  switch (status) {
    case "OPEN":
      return <Badge variant="success">Open</Badge>;
    case "ASSIGNED":
      return <Badge variant="warning">Assigned</Badge>;
    case "EXPIRED":
      return <Badge variant="secondary">Expired</Badge>;
    case "CLOSED":
      return <Badge variant="outline">Closed</Badge>;
    default:
      return <Badge>{status}</Badge>;
  }
}

export function OpenPositions({ trades }: OpenPositionsProps) {
  const openTrades = trades.filter((t) => t.status === "OPEN");

  return (
    <Card className="col-span-full">
      <CardHeader>
        <CardTitle>Active Positions</CardTitle>
        <CardDescription>
          {openTrades.length} open position{openTrades.length !== 1 ? "s" : ""} currently active
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Ticker</TableHead>
              <TableHead>Strategy</TableHead>
              <TableHead>Type</TableHead>
              <TableHead className="text-right">Strike</TableHead>
              <TableHead className="text-right">Contracts</TableHead>
              <TableHead className="text-right">Premium</TableHead>
              <TableHead>Expiration</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {openTrades.map((trade) => (
              <TableRow key={trade.id}>
                <TableCell className="font-bold">{trade.ticker}</TableCell>
                <TableCell>{getStrategyLabel(trade.strategy)}</TableCell>
                <TableCell>
                  <Badge variant={trade.optionType === "CALL" ? "default" : "secondary"}>
                    {trade.optionType}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">{formatCurrency(trade.strikePrice)}</TableCell>
                <TableCell className="text-right">{trade.contracts}</TableCell>
                <TableCell className="text-right font-medium text-emerald-600 dark:text-emerald-400">
                  {formatCurrency(trade.premiumReceived)}
                </TableCell>
                <TableCell>{formatDate(trade.expirationDate)}</TableCell>
                <TableCell>{getStatusBadge(trade.status)}</TableCell>
              </TableRow>
            ))}
            {openTrades.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                  No open positions
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
