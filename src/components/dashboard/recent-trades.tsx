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

interface RecentTradesProps {
  trades: OptionTrade[];
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

export function RecentTrades({ trades }: RecentTradesProps) {
  const closedTrades = trades
    .filter((t) => t.status !== "OPEN")
    .sort((a, b) => new Date(b.closeDate || b.expirationDate).getTime() - new Date(a.closeDate || a.expirationDate).getTime());

  return (
    <Card className="col-span-full">
      <CardHeader>
        <CardTitle>Recent Closed Trades</CardTitle>
        <CardDescription>
          History of completed options trades and their P&L
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Ticker</TableHead>
              <TableHead>Type</TableHead>
              <TableHead className="text-right">Strike</TableHead>
              <TableHead className="text-right">Premium</TableHead>
              <TableHead>Closed</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">P&L</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {closedTrades.map((trade) => (
              <TableRow key={trade.id}>
                <TableCell className="font-bold">{trade.ticker}</TableCell>
                <TableCell>
                  <Badge variant={trade.optionType === "CALL" ? "default" : "secondary"}>
                    {trade.optionType}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">{formatCurrency(trade.strikePrice)}</TableCell>
                <TableCell className="text-right">{formatCurrency(trade.premiumReceived)}</TableCell>
                <TableCell>{formatDate(trade.closeDate || trade.expirationDate)}</TableCell>
                <TableCell>{getStatusBadge(trade.status)}</TableCell>
                <TableCell
                  className={`text-right font-semibold ${
                    (trade.realizedPnL ?? 0) >= 0
                      ? "text-emerald-600 dark:text-emerald-400"
                      : "text-red-600 dark:text-red-400"
                  }`}
                >
                  {trade.realizedPnL !== undefined
                    ? formatCurrency(trade.realizedPnL)
                    : "—"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
