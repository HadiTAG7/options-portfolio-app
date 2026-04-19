// ============================================================
// Partner (Investor) Types
// ============================================================

export interface BalanceHistoryEntry {
  date: string;
  balance: number;
}

export interface Partner {
  id: string;
  name: string;
  code: string; // e.g. "K-89204"
  avatarUrl?: string;
  initials: string;
  totalBalance: number;
  ownershipPercentage: number;
  managementFeeRate: number; // percentage
  performance24h: number; // percentage change
  performanceTrend: "up" | "down";
  joinedAt: string;
  isAdmin: boolean;
  totalDeposits: number;
  totalWithdrawals: number;
  currentBalance: number;
  totalNetProfit: number;
  managementFeesPaid: number;
  baseCapital: number;
  balanceHistory: BalanceHistoryEntry[];
}

// ============================================================
// Partner Detail Types
// ============================================================

export interface PartnerDetail extends Partner {
  totalEquity: number;
  netPnL: number;
  dailyChangePercent: number;
  totalFeesPaid: number;
  availableLiquidity: number;
  assets: PartnerAsset[];
  activities: PartnerActivity[];
  greeks: Greeks;
}

export interface PartnerAsset {
  symbol: string;
  type: "stock" | "option";
  totalQuantity: number;
  partnerShare: number;
  marketValue: number;
  changePercent: number;
}

export interface PartnerActivity {
  id: string;
  description: string;
  timestamp: string;
  amount: number;
  type: "profit" | "loss";
}

export interface Greeks {
  delta: number;
  theta: number;
  gamma: number;
  vega: number;
}

// ============================================================
// Options Trade Types
// ============================================================

export type OptionTradeType = "Sell Put" | "Covered Call" | "Buy Call" | "Buy Put";

export interface OptionTrade {
  id: string;
  symbol: string;
  type: OptionTradeType;
  quantity: number;
  premium: number;
  strikePrice: number;
  expirationDate: string;
  entryDate: string;
  unrealizedPnL: number;
  totalProfit: number;
  returnPercent: number;
}

// ============================================================
// Stock Position Types
// ============================================================

export interface StockPosition {
  id: string;
  symbol: string;
  quantity: number;
  buyPrice: number;
  currentPrice: number;
  targetPrice: number;
  priceDirection: "up" | "down";
}

// ============================================================
// Portfolio Summary Types
// ============================================================

export interface PortfolioSummary {
  totalAUM: number;
  totalAUMChange: number;
  totalProfits: number;
  totalPartners: number;
  newPartners: number;
  managementFeesCollected: number;
  pendingRequests: number;
}

// ============================================================
// Monthly Summary Types
// ============================================================

export interface MonthlySummary {
  id: string;
  month: string;
  monthAr: string;
  quarter: string;
  totalCapital: number;
  totalProfits: number;
  managementFees: number;
  status: "Settled" | "Pending" | "Processing";
}

// ============================================================
// Chart Data Types
// ============================================================

export interface ProfitDataPoint {
  month: string;
  profit: number;
}

export interface PortfolioDistribution {
  label: string;
  labelAr: string;
  percentage: number;
  color: string;
}
