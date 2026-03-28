// ============================================================
// Investor Management Types
// ============================================================

export interface Investor {
  id: string;
  name: string;
  email: string;
  avatarUrl?: string;
  initialCapital: number;
  currentBalance: number;
  totalProfit: number;
  equityPercentage: number; // Dynamically calculated based on capital contribution
  joinedAt: string; // ISO date string
}

// ============================================================
// Options Trade Types
// ============================================================

export type OptionType = "CALL" | "PUT";

export type TradeStrategy = "COVERED_CALL" | "CASH_SECURED_PUT" | "WHEEL";

export type TradeStatus = "OPEN" | "ASSIGNED" | "EXPIRED" | "CLOSED";

export interface OptionTrade {
  id: string;
  ticker: string;
  optionType: OptionType;
  strategy: TradeStrategy;
  strikePrice: number;
  contracts: number; // Each contract = 100 shares
  premiumReceived: number; // Total premium collected
  openDate: string; // ISO date string
  expirationDate: string; // ISO date string
  closeDate?: string; // ISO date string, set when trade is closed/assigned/expired
  status: TradeStatus;
  underlyingPriceAtOpen: number;
  underlyingPriceAtClose?: number;
  realizedPnL?: number; // P&L from closed trades
  notes?: string;
}

// ============================================================
// Portfolio Summary Types
// ============================================================

export interface PortfolioSummary {
  totalPortfolioValue: number;
  totalCashAvailable: number;
  totalInvested: number;
  totalPremiumCollected: number;
  totalRealizedPnL: number;
  openPositionsCount: number;
  closedTradesCount: number;
  winRate: number; // percentage
  monthlyReturn: number; // percentage
}

// ============================================================
// P&L Distribution Types
// ============================================================

export interface ProfitDistribution {
  investorId: string;
  investorName: string;
  equityPercentage: number;
  allocatedProfit: number;
  totalDistributed: number;
}

// ============================================================
// Chart / Performance Types
// ============================================================

export interface PerformanceDataPoint {
  date: string;
  portfolioValue: number;
  cashBalance: number;
  totalPremium: number;
}
