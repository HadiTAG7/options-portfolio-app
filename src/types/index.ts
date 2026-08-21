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
  email: string | null;
  avatarUrl?: string;
  initials: string;
  totalBalance: number;
  ownershipPercentage: number;
  managementFeeRate: number; // percentage
  performance24h: number; // percentage change
  performanceTrend: "up" | "down";
  joinedAt: string;
  entryDate: string | null; // date the partner entered the fund (YYYY-MM-DD)
  lastSettlementDate: string | null; // ISO timestamp of last profit capitalization
  isAdmin: boolean;
  totalDeposits: number;
  totalWithdrawals: number;
  currentBalance: number;
  totalNetProfit: number;
  managementFeesPaid: number;
  baseCapital: number;
  balanceHistory: BalanceHistoryEntry[];
  archivedAt: string | null;
  // GP-only commission pot: performance fees locked in from LP
  // settlements but not yet withdrawn or capitalized by the GP. It only
  // grows as LPs settle and only shrinks when the GP withdraws or
  // capitalizes it — never from ordinary partner activity. 0/absent for
  // LPs (and for the GP until the first LP settles under the new model).
  gpFeesAccrued: number;
  // Gross profit already paid out via PARTIAL profit withdrawals since
  // this partner's last full settlement. The distribution engine
  // subtracts it from the computed gross so the remainder stays pending
  // (instead of being force-capitalized). Reset to 0 whenever a full
  // settlement stamp is written (تثبيت / full profit withdrawal).
  profitTakenGross: number;
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
// Trade Types (unified: options + stocks)
// ============================================================

export type TradeType = "Sell Call" | "Sell Put" | "Stock Sell";

export type TradeStatus = "open" | "closed";

export interface Trade {
  id: string;
  ticker: string;
  type: string; // kept wide — DB may hold more categories than the canonical three
  quantity: number;
  premium: number;
  strike: number;
  result: number;
  expiration: string; // empty string for Stock Sell rows
  date: string;
  status: TradeStatus;
  autoClosed: boolean;
  // Exact recording timestamp (trades.created_at). Used to order
  // same-day events against last_settlement_date in the eligibility
  // engine. Null/absent on rows that predate migration 011 and on
  // seed/local-fallback rows — consumers must fall back to `date`.
  createdAt?: string | null;
  // Covered-call linkage: id of the active stock lot this Sell Call is
  // written against. Null/absent for everything else.
  linkedStockId?: string | null;
  // Set by the expiration sweep when the last known price was through
  // the strike, i.e. the contract probably finished in the money and
  // shares moved. The sweep books the premium and raises this flag
  // instead of inventing a settlement price; the GP clears it by
  // recording what actually happened.
  needsReview?: boolean;
}

// Journal row from the transactions table — the partner statement's
// data source. Types: Deposit / Withdrawal / Fee / Capitalize.
export interface FundTransaction {
  id: string;
  investorId: string;
  amount: number;
  type: "Deposit" | "Withdrawal" | "Fee" | "Capitalize";
  date: string;
  createdAt: string;
  note: string | null;
  relatedPartnerId: string | null;
  // Groups every row a single money operation created, so an undo can
  // find and remove them together. Absent on pre-undo-feature rows.
  opId?: string | null;
}

// The full restorable before-state of one partner row (DB-column keyed).
// Captured before a money operation runs so an undo can put the row back
// exactly — every money and settlement field, not just the balance.
export interface PartnerSnapshot {
  id: string;
  currentBalance: number;
  total_balance: number;
  totalDeposits: number;
  totalWithdrawals: number;
  baseCapital: number;
  last_settlement_date: string | null;
  profitTakenGross: number;
  gpFeesAccrued: number;
  balanceHistory: BalanceHistoryEntry[];
}

// A frozen monthly-profit record for one partner in one month. Stored so
// the profit log never re-computes (and drifts) — the GP can edit it to
// match what was actually recorded/sent. id = `${month}__${partnerId}`.
export interface MonthlyProfit {
  id: string;
  month: string; // YYYY-MM
  partnerId: string;
  gross: number;
  fee: number;
  net: number;
}

export type FundOperationKind =
  | "withdrawal"
  | "capitalize"
  | "deposit"
  | "commission_withdraw"
  | "commission_capitalize";

// One reversible money operation (the undo journal). Stored in the
// `operations` Firestore collection (GP-only). `snapshots` holds the
// BEFORE state of every partner row the operation touched, so undo is a
// straight restore; `partnerIds` mirrors their ids for the LIFO/overlap
// safety check.
export interface FundOperation {
  id: string;
  at: string; // ISO timestamp
  kind: FundOperationKind;
  label: string; // Arabic, human-readable
  partnerIds: string[];
  snapshots: PartnerSnapshot[];
  reversedAt: string | null;
}

// ============================================================
// Active Stock Holding (from Supabase active_stocks table)
// ============================================================

export interface ActiveStock {
  id: string;
  ticker: string;
  quantity: number;
  purchasePrice: number;
  targetSellPrice: number;
  purchaseDate: string;
  costBasis: number; // computed: quantity * purchasePrice
  currentPrice?: number | null; // live quote (null if fetch failed)
  // Previous session's close, used for the "today only" P&L card
  // ((currentPrice − previousClose) × quantity). In-memory only — it comes
  // from the live quote and is not persisted.
  previousClose?: number | null;
  priceLoading?: boolean; // true while live quote is being fetched
}

// ============================================================
// Legacy Option Trade Types (kept for mock data / compatibility)
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
