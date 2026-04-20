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
          code: string | null;
          initials: string | null;
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
          total_balance?: number;
          currentBalance?: number;
          totalDeposits?: number;
          baseCapital?: number;
          managementFeePercent?: number | null;
          balanceHistory?: BalanceHistoryEntry[];
          isAdmin?: boolean;
          code?: string | null;
          initials?: string | null;
          avatar_url?: string | null;
          ownership_percentage?: number;
          management_fee_rate?: number;
          performance_24h?: number;
          performance_trend?: "up" | "down";
          joined_at?: string;
          created_at?: string;
          updated_at?: string;
          totalWithdrawals?: number;
          totalNetProfit?: number;
          managementFeesPaid?: number;
        };
        Update: Partial<Database["public"]["Tables"]["partners"]["Insert"]>;
        Relationships: [];
      };
      trades: {
        Row: {
          id: string;
          ticker: string;
          type: string;
          quantity: number;
          premium: number;
          strike: number;
          result: number;
          expiration: string;
          date: string;
          status: "open" | "closed";
          autoClosed: boolean;
        };
        Insert: {
          id?: string;
          ticker: string;
          type: string;
          quantity: number;
          premium?: number;
          strike?: number;
          result?: number;
          expiration?: string;
          date: string;
          status?: "open" | "closed";
          autoClosed?: boolean;
        };
        Update: Partial<Database["public"]["Tables"]["trades"]["Insert"]>;
        Relationships: [];
      };
      active_stocks: {
        Row: {
          id: string;
          ticker: string;
          quantity: number;
          purchasePrice: number;
          targetSellPrice: number;
          purchaseDate: string;
        };
        Insert: {
          id?: string;
          ticker: string;
          quantity: number;
          purchasePrice: number;
          targetSellPrice?: number;
          purchaseDate?: string;
        };
        Update: Partial<Database["public"]["Tables"]["active_stocks"]["Insert"]>;
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
export type ActiveStockRow = Database["public"]["Tables"]["active_stocks"]["Row"];
export type TransactionRow = Database["public"]["Tables"]["transactions"]["Row"];
