"use client";

import { useEffect } from "react";
import { create } from "zustand";
import {
  DEFAULT_SAR_PER_USD,
  getDisplayCurrency,
  setDisplayCurrency,
  type CurrencyCode,
} from "@/lib/currency";

const STORAGE_KEY = "displayCurrency";
const RATE_KEY = "sarPerUsd";

interface CurrencyState {
  currency: CurrencyCode;
  rate: number;
  setCurrency: (code: CurrencyCode) => void;
  setRate: (rate: number) => void;
  toggle: () => void;
}

// Every setter also pushes the value into lib/currency's module state,
// which is what the money formatters read — so the store and the
// formatters can never disagree.
function apply(code: CurrencyCode, rate: number) {
  setDisplayCurrency(code, rate);
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(STORAGE_KEY, code);
      window.localStorage.setItem(RATE_KEY, String(rate));
    } catch {
      // private mode / storage disabled — the choice just won't persist
    }
  }
}

export const useCurrencyStore = create<CurrencyState>((set, get) => ({
  currency: "USD",
  rate: DEFAULT_SAR_PER_USD,
  setCurrency: (code) => {
    apply(code, get().rate);
    set({ currency: code });
  },
  setRate: (rate) => {
    if (!Number.isFinite(rate) || rate <= 0) return;
    apply(get().currency, rate);
    set({ rate });
  },
  toggle: () => {
    const next: CurrencyCode = get().currency === "USD" ? "SAR" : "USD";
    apply(next, get().rate);
    set({ currency: next });
  },
}));

// Restore the saved choice once on mount. Reading localStorage during
// render would break hydration (server renders USD), so it happens in an
// effect and only fires a state update when the stored value differs.
export function useCurrencyHydration(): void {
  useEffect(() => {
    if (typeof window === "undefined") return;
    let stored: string | null = null;
    let storedRate: string | null = null;
    try {
      stored = window.localStorage.getItem(STORAGE_KEY);
      storedRate = window.localStorage.getItem(RATE_KEY);
    } catch {
      return;
    }
    const rate = Number(storedRate);
    const state = useCurrencyStore.getState();
    if (Number.isFinite(rate) && rate > 0 && rate !== state.rate) {
      state.setRate(rate);
    }
    if (stored === "SAR" || stored === "USD") {
      if (stored !== state.currency) state.setCurrency(stored);
      else setDisplayCurrency(stored, Number.isFinite(rate) && rate > 0 ? rate : undefined);
    }
  }, []);
}

// Subscribe a component to the active currency.
//
// Any page that renders money MUST call this: the formatters read module
// state, so without a subscription React would have no reason to re-render
// and the figures would stay in the old currency until something else
// triggered a render. Returning the code also guards against the module
// and the store drifting apart after a fast refresh.
export function useCurrency(): CurrencyCode {
  const currency = useCurrencyStore((s) => s.currency);
  if (typeof window !== "undefined" && getDisplayCurrency() !== currency) {
    setDisplayCurrency(currency, useCurrencyStore.getState().rate);
  }
  return currency;
}
