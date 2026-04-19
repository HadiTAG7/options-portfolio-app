import type {
  Partner,
  PartnerDetail,
  OptionTrade,
  StockPosition,
  PortfolioSummary,
  MonthlySummary,
  ProfitDataPoint,
  PortfolioDistribution,
} from "@/types";

// ============================================================
// Portfolio Summary
// ============================================================

export const portfolioSummary: PortfolioSummary = {
  totalAUM: 2450000,
  totalAUMChange: 12,
  totalProfits: 412850,
  totalPartners: 128,
  newPartners: 4,
  managementFeesCollected: 48200,
  pendingRequests: 4,
};

// ============================================================
// Partners
// ============================================================

export const partners: Partner[] = [
  {
    id: "K-89204",
    name: "أحمد الهواري",
    code: "K-89204",
    initials: "AH",
    totalBalance: 4120000,
    ownershipPercentage: 29.0,
    managementFeeRate: 1.25,
    performance24h: 0.42,
    performanceTrend: "up",
    joinedAt: "2023-01-15",
    isAdmin: true,
    totalDeposits: 4000000,
    totalWithdrawals: 0,
    currentBalance: 4120000,
    totalNetProfit: 120000,
    managementFeesPaid: 0,
    baseCapital: 4000000,
    balanceHistory: [{ date: "2023-01-15", balance: 4000000 }],
  },
  {
    id: "K-77312",
    name: "سارة منصور",
    code: "K-77312",
    initials: "SM",
    totalBalance: 2850500,
    ownershipPercentage: 20.1,
    managementFeeRate: 1.5,
    performance24h: -0.15,
    performanceTrend: "down",
    joinedAt: "2023-03-22",
    isAdmin: false,
    totalDeposits: 2800000,
    totalWithdrawals: 0,
    currentBalance: 2850500,
    totalNetProfit: 50500,
    managementFeesPaid: 8400,
    baseCapital: 2800000,
    balanceHistory: [{ date: "2023-03-22", balance: 2800000 }],
  },
  {
    id: "K-91283",
    name: "فهد الكواري",
    code: "K-91283",
    initials: "FK",
    totalBalance: 1240000,
    ownershipPercentage: 8.7,
    managementFeeRate: 1.1,
    performance24h: 1.82,
    performanceTrend: "up",
    joinedAt: "2023-06-10",
    isAdmin: false,
    totalDeposits: 1200000,
    totalWithdrawals: 0,
    currentBalance: 1240000,
    totalNetProfit: 40000,
    managementFeesPaid: 5280,
    baseCapital: 1200000,
    balanceHistory: [{ date: "2023-06-10", balance: 1200000 }],
  },
  {
    id: "K-44521",
    name: "سالم العامري",
    code: "K-44521",
    initials: "SA",
    totalBalance: 1780000,
    ownershipPercentage: 12.5,
    managementFeeRate: 1.25,
    performance24h: 2.4,
    performanceTrend: "up",
    joinedAt: "2023-02-01",
    isAdmin: false,
    totalDeposits: 1700000,
    totalWithdrawals: 0,
    currentBalance: 1780000,
    totalNetProfit: 80000,
    managementFeesPaid: 8500,
    baseCapital: 1700000,
    balanceHistory: [{ date: "2023-02-01", balance: 1700000 }],
  },
  {
    id: "K-55192",
    name: "نورة الحربي",
    code: "K-55192",
    initials: "NH",
    totalBalance: 2100000,
    ownershipPercentage: 14.8,
    managementFeeRate: 1.3,
    performance24h: -0.32,
    performanceTrend: "down",
    joinedAt: "2023-04-18",
    isAdmin: false,
    totalDeposits: 2050000,
    totalWithdrawals: 0,
    currentBalance: 2100000,
    totalNetProfit: 50000,
    managementFeesPaid: 10660,
    baseCapital: 2050000,
    balanceHistory: [{ date: "2023-04-18", balance: 2050000 }],
  },
  {
    id: "K-62847",
    name: "خالد المطيري",
    code: "K-62847",
    initials: "KM",
    totalBalance: 2118450,
    ownershipPercentage: 14.9,
    managementFeeRate: 1.25,
    performance24h: 0.88,
    performanceTrend: "up",
    joinedAt: "2023-05-30",
    isAdmin: false,
    totalDeposits: 2000000,
    totalWithdrawals: 0,
    currentBalance: 2118450,
    totalNetProfit: 118450,
    managementFeesPaid: 10000,
    baseCapital: 2000000,
    balanceHistory: [{ date: "2023-05-30", balance: 2000000 }],
  },
];

// ============================================================
// Partner Detail (سالم العامري)
// ============================================================

export const partnerDetail: PartnerDetail = {
  id: "K-44521",
  name: "سالم العامري",
  code: "K-44521",
  initials: "SA",
  totalBalance: 1780000,
  ownershipPercentage: 12.5,
  managementFeeRate: 1.25,
  performance24h: 2.4,
  performanceTrend: "up",
  joinedAt: "2023-02-01",
  isAdmin: false,
  totalDeposits: 1700000,
  totalWithdrawals: 0,
  currentBalance: 1780000,
  totalNetProfit: 80000,
  managementFeesPaid: 8500,
  baseCapital: 1700000,
  balanceHistory: [{ date: "2023-02-01", balance: 1700000 }],
  totalEquity: 428190.42,
  netPnL: 54201.18,
  dailyChangePercent: 2.4,
  totalFeesPaid: 12450,
  availableLiquidity: 89200.5,
  assets: [
    {
      symbol: "TSLA",
      type: "stock",
      totalQuantity: 1200,
      partnerShare: 150,
      marketValue: 36450,
      changePercent: 4.22,
    },
    {
      symbol: "AAPL 250C 10/24",
      type: "option",
      totalQuantity: 40,
      partnerShare: 5,
      marketValue: 12800,
      changePercent: -1.15,
    },
    {
      symbol: "NVDA",
      type: "stock",
      totalQuantity: 800,
      partnerShare: 100,
      marketValue: 122300,
      changePercent: 12.8,
    },
    {
      symbol: "SPY 540P 12/24",
      type: "option",
      totalQuantity: 100,
      partnerShare: 12.5,
      marketValue: 4200,
      changePercent: -0.45,
    },
  ],
  activities: [
    {
      id: "act-1",
      description: "تسييل جزء من NVDA",
      timestamp: "منذ ساعتين",
      amount: -12400,
      type: "loss",
    },
    {
      id: "act-2",
      description: "توزيع أرباح ربع سنوية",
      timestamp: "أمس",
      amount: 1120.5,
      type: "profit",
    },
  ],
  greeks: {
    delta: 0.642,
    theta: -12.4,
    gamma: 0.021,
    vega: 42.8,
  },
};

// ============================================================
// Option Trades
// ============================================================

export const optionTrades: OptionTrade[] = [
  {
    id: "opt-1",
    symbol: "NVDA",
    type: "Sell Put",
    quantity: 12,
    premium: 4.2,
    strikePrice: 890,
    expirationDate: "Jun 21, 2024",
    entryDate: "May 01, 2024",
    unrealizedPnL: 1240.5,
    totalProfit: 5040,
    returnPercent: 24.6,
  },
  {
    id: "opt-2",
    symbol: "TSLA",
    type: "Covered Call",
    quantity: 5,
    premium: 2.15,
    strikePrice: 185,
    expirationDate: "May 17, 2024",
    entryDate: "Apr 22, 2024",
    unrealizedPnL: -312.2,
    totalProfit: -1075,
    returnPercent: -12.4,
  },
  {
    id: "opt-3",
    symbol: "AAPL",
    type: "Sell Put",
    quantity: 25,
    premium: 1.85,
    strikePrice: 170,
    expirationDate: "Jul 19, 2024",
    entryDate: "May 05, 2024",
    unrealizedPnL: 450,
    totalProfit: 4625,
    returnPercent: 9.8,
  },
];

// ============================================================
// Stock Positions
// ============================================================

export const stockPositions: StockPosition[] = [
  {
    id: "stk-1",
    symbol: "MSFT",
    quantity: 150,
    buyPrice: 395.4,
    currentPrice: 412.3,
    targetPrice: 450,
    priceDirection: "up",
  },
  {
    id: "stk-2",
    symbol: "AMD",
    quantity: 400,
    buyPrice: 172.1,
    currentPrice: 164.5,
    targetPrice: 210,
    priceDirection: "down",
  },
  {
    id: "stk-3",
    symbol: "GOOGL",
    quantity: 80,
    buyPrice: 145.2,
    currentPrice: 168.45,
    targetPrice: 180,
    priceDirection: "up",
  },
];

// ============================================================
// Monthly Summary
// ============================================================

export const monthlySummaries: MonthlySummary[] = [
  {
    id: "ms-1",
    month: "October 2023",
    monthAr: "أكتوبر 2023",
    quarter: "Q4 Fiscal",
    totalCapital: 2450000,
    totalProfits: 85420,
    managementFees: 12400,
    status: "Settled",
  },
  {
    id: "ms-2",
    month: "September 2023",
    monthAr: "سبتمبر 2023",
    quarter: "Q3 Fiscal",
    totalCapital: 2364580,
    totalProfits: 62110,
    managementFees: 9850,
    status: "Settled",
  },
  {
    id: "ms-3",
    month: "August 2023",
    monthAr: "أغسطس 2023",
    quarter: "Q3 Fiscal",
    totalCapital: 2302470,
    totalProfits: 45900,
    managementFees: 8200,
    status: "Settled",
  },
  {
    id: "ms-4",
    month: "July 2023",
    monthAr: "يوليو 2023",
    quarter: "Q3 Fiscal",
    totalCapital: 2256570,
    totalProfits: 72300,
    managementFees: 10450,
    status: "Settled",
  },
];

// ============================================================
// Chart Data
// ============================================================

export const profitData: ProfitDataPoint[] = [
  { month: "Jan", profit: 20000 },
  { month: "Feb", profit: 25000 },
  { month: "Mar", profit: 40000 },
  { month: "Apr", profit: 35000 },
  { month: "May", profit: 55000 },
  { month: "Jun", profit: 60000 },
  { month: "Jul", profit: 72300 },
  { month: "Aug", profit: 45900 },
  { month: "Sep", profit: 62110 },
  { month: "Oct", profit: 85420 },
  { month: "Nov", profit: 78000 },
  { month: "Dec", profit: 92000 },
];

export const portfolioDistribution: PortfolioDistribution[] = [
  { label: "Options", labelAr: "الخيارات", percentage: 65, color: "primary-container" },
  { label: "Stocks", labelAr: "الأسهم", percentage: 25, color: "tertiary-dim" },
  { label: "Cash", labelAr: "النقد", percentage: 10, color: "secondary" },
];

// ============================================================
// Partners Total Assets (for partners page header)
// ============================================================

export const partnersTotalAssets = 14208450;
export const partnersCount = 24;
