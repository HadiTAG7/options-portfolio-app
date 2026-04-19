// Auto-generated types matching the Supabase SQL schema.
// Regenerate with: npx supabase gen types typescript --local > src/types/database.ts

export interface BalanceHistoryEntry {
  date: string;
  balance: number;
}

export interface Database {
  public: {
    Tables: {
      partners: {
        Row: {
          id: string;
          name: string;
          code: string;
          initials: string;
          avatar_url: string | null;
          total_balance: number;
          ownership_percentage: number;
          management_fee_rate: number;
          performance_24h: number;
          performance_trend: "up" | "down";
          joined_at: string;
          created_at: string;
          updated_at: string;
          isAdmin: boolean;
          totalDeposits: number;
          totalWithdrawals: number;
          currentBalance: number;
          totalNetProfit: number;
          managementFeesPaid: number;
          managementFeePercent: number | null;
          baseCapital: number;
          balanceHistory: BalanceHistoryEntry[];
        };
        Insert: {
          id?: string;
          name: string;
          code: string;
          initials: string;
          avatar_url?: string | null;
          total_balance: number;
          ownership_percentage?: number;
          management_fee_rate?: number;
          performance_24h?: number;
          performance_trend?: "up" | "down";
          joined_at?: string;
          created_at?: string;
          updated_at?: string;
          isAdmin?: boolean;
          totalDeposits?: number;
          totalWithdrawals?: number;
          currentBalance?: number;
          totalNetProfit?: number;
          managementFeesPaid?: number;
          managementFeePercent?: number | null;
          baseCapital?: number;
          balanceHistory?: BalanceHistoryEntry[];
        };
        Update: Partial<Database["public"]["Tables"]["partners"]["Insert"]>;
        Relationships: [];
      };
      trades: {
        Row: {
          id: string;
          symbol: string;
          trade_type: "Sell Put" | "Covered Call" | "Buy Call" | "Buy Put";
          quantity: number;
          premium: number;
          strike_price: number;
          expiration_date: string;
          entry_date: string;
          unrealized_pnl: number;
          total_profit: number;
          return_percent: number;
          status: "open" | "closed" | "expired" | "assigned";
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          symbol: string;
          trade_type: "Sell Put" | "Covered Call" | "Buy Call" | "Buy Put";
          quantity: number;
          premium: number;
          strike_price: number;
          expiration_date: string;
          entry_date: string;
          unrealized_pnl?: number;
          total_profit?: number;
          return_percent?: number;
          status?: "open" | "closed" | "expired" | "assigned";
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["trades"]["Insert"]>;
        Relationships: [];
      };
      transactions: {
        Row: {
          id: string;
          investorId: string;
          amount: number;
          type: "Deposit" | "Withdrawal";
          date: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          investorId: string;
          amount: number;
          type: "Deposit" | "Withdrawal";
          date?: string;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["transactions"]["Insert"]>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      recalculate_ownership: {
        Args: Record<string, never>;
        Returns: undefined;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}

// Convenience aliases
export type PartnerRow = Database["public"]["Tables"]["partners"]["Row"];
export type TradeRow = Database["public"]["Tables"]["trades"]["Row"];
export type TransactionRow = Database["public"]["Tables"]["transactions"]["Row"];
