import type {
  Investor,
  OptionTrade,
  PortfolioSummary,
  ProfitDistribution,
  PerformanceDataPoint,
} from "@/types";

// ============================================================
// Mock Investors
// ============================================================

export const investors: Investor[] = [
  {
    id: "inv-001",
    name: "Sarah Mitchell",
    email: "sarah@example.com",
    initialCapital: 50000,
    currentBalance: 54250,
    totalProfit: 4250,
    equityPercentage: 41.67,
    joinedAt: "2025-01-15",
  },
  {
    id: "inv-002",
    name: "James Chen",
    email: "james@example.com",
    initialCapital: 35000,
    currentBalance: 37975,
    totalProfit: 2975,
    equityPercentage: 29.17,
    joinedAt: "2025-01-15",
  },
  {
    id: "inv-003",
    name: "Maria Rodriguez",
    email: "maria@example.com",
    initialCapital: 25000,
    currentBalance: 27125,
    totalProfit: 2125,
    equityPercentage: 20.83,
    joinedAt: "2025-02-01",
  },
  {
    id: "inv-004",
    name: "David Park",
    email: "david@example.com",
    initialCapital: 10000,
    currentBalance: 10850,
    totalProfit: 850,
    equityPercentage: 8.33,
    joinedAt: "2025-03-01",
  },
];

// ============================================================
// Mock Trades
// ============================================================

export const trades: OptionTrade[] = [
  {
    id: "trade-001",
    ticker: "AAPL",
    optionType: "CALL",
    strategy: "COVERED_CALL",
    strikePrice: 195,
    contracts: 3,
    premiumReceived: 840,
    openDate: "2025-11-04",
    expirationDate: "2025-11-29",
    status: "OPEN",
    underlyingPriceAtOpen: 189.5,
    notes: "Covered call on existing AAPL position",
  },
  {
    id: "trade-002",
    ticker: "MSFT",
    optionType: "PUT",
    strategy: "CASH_SECURED_PUT",
    strikePrice: 410,
    contracts: 2,
    premiumReceived: 1120,
    openDate: "2025-10-28",
    expirationDate: "2025-11-22",
    status: "OPEN",
    underlyingPriceAtOpen: 422.3,
    notes: "CSP - willing to own at $410",
  },
  {
    id: "trade-003",
    ticker: "NVDA",
    optionType: "PUT",
    strategy: "WHEEL",
    strikePrice: 480,
    contracts: 1,
    premiumReceived: 2350,
    openDate: "2025-10-14",
    expirationDate: "2025-11-08",
    closeDate: "2025-11-08",
    status: "EXPIRED",
    underlyingPriceAtOpen: 510.2,
    underlyingPriceAtClose: 495.8,
    realizedPnL: 2350,
    notes: "Wheel strategy - put expired worthless, kept full premium",
  },
  {
    id: "trade-004",
    ticker: "AMD",
    optionType: "PUT",
    strategy: "CASH_SECURED_PUT",
    strikePrice: 145,
    contracts: 4,
    premiumReceived: 1680,
    openDate: "2025-10-07",
    expirationDate: "2025-11-01",
    closeDate: "2025-11-01",
    status: "ASSIGNED",
    underlyingPriceAtOpen: 152.4,
    underlyingPriceAtClose: 141.2,
    realizedPnL: -1520,
    notes: "Assigned - now holding 400 shares of AMD at effective cost basis $141.80",
  },
  {
    id: "trade-005",
    ticker: "TSLA",
    optionType: "CALL",
    strategy: "COVERED_CALL",
    strikePrice: 260,
    contracts: 2,
    premiumReceived: 1540,
    openDate: "2025-10-21",
    expirationDate: "2025-11-15",
    closeDate: "2025-11-15",
    status: "EXPIRED",
    underlyingPriceAtOpen: 248.7,
    underlyingPriceAtClose: 253.1,
    realizedPnL: 1540,
    notes: "CC expired OTM - premium kept",
  },
  {
    id: "trade-006",
    ticker: "SPY",
    optionType: "PUT",
    strategy: "CASH_SECURED_PUT",
    strikePrice: 570,
    contracts: 1,
    premiumReceived: 890,
    openDate: "2025-11-01",
    expirationDate: "2025-12-06",
    status: "OPEN",
    underlyingPriceAtOpen: 582.4,
    notes: "Monthly SPY put for income",
  },
  {
    id: "trade-007",
    ticker: "QQQ",
    optionType: "CALL",
    strategy: "COVERED_CALL",
    strikePrice: 500,
    contracts: 2,
    premiumReceived: 960,
    openDate: "2025-09-22",
    expirationDate: "2025-10-18",
    closeDate: "2025-10-18",
    status: "EXPIRED",
    underlyingPriceAtOpen: 488.5,
    underlyingPriceAtClose: 492.1,
    realizedPnL: 960,
    notes: "QQQ covered call - expired worthless",
  },
  {
    id: "trade-008",
    ticker: "AMZN",
    optionType: "PUT",
    strategy: "WHEEL",
    strikePrice: 185,
    contracts: 3,
    premiumReceived: 1350,
    openDate: "2025-11-06",
    expirationDate: "2025-12-13",
    status: "OPEN",
    underlyingPriceAtOpen: 194.2,
    notes: "Wheel entry - CSP on AMZN",
  },
];

// ============================================================
// Portfolio Summary
// ============================================================

export const portfolioSummary: PortfolioSummary = {
  totalPortfolioValue: 130200,
  totalCashAvailable: 68400,
  totalInvested: 61800,
  totalPremiumCollected: 10730,
  totalRealizedPnL: 3330,
  openPositionsCount: trades.filter((t) => t.status === "OPEN").length,
  closedTradesCount: trades.filter((t) => t.status !== "OPEN").length,
  winRate: 75,
  monthlyReturn: 2.78,
};

// ============================================================
// Profit Distribution
// ============================================================

export const profitDistributions: ProfitDistribution[] = investors.map(
  (inv) => ({
    investorId: inv.id,
    investorName: inv.name,
    equityPercentage: inv.equityPercentage,
    allocatedProfit: inv.totalProfit,
    totalDistributed: inv.totalProfit,
  })
);

// ============================================================
// Historical Performance (last 6 months)
// ============================================================

export const performanceData: PerformanceDataPoint[] = [
  { date: "Jun 2025", portfolioValue: 120000, cashBalance: 85000, totalPremium: 0 },
  { date: "Jul 2025", portfolioValue: 121800, cashBalance: 80200, totalPremium: 1800 },
  { date: "Aug 2025", portfolioValue: 123500, cashBalance: 76500, totalPremium: 3700 },
  { date: "Sep 2025", portfolioValue: 125900, cashBalance: 72400, totalPremium: 5900 },
  { date: "Oct 2025", portfolioValue: 127400, cashBalance: 70100, totalPremium: 8380 },
  { date: "Nov 2025", portfolioValue: 130200, cashBalance: 68400, totalPremium: 10730 },
];
