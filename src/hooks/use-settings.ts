"use client";

import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "kt.fund.settings";

export interface FundSettings {
  managementFeePct: number; // 0–100 (default 20)
  autoMultiplyOptions: boolean;
  priceRefreshInterval: "manual" | "1m" | "5m" | "15m";
}

const DEFAULTS: FundSettings = {
  managementFeePct: 20,
  autoMultiplyOptions: false,
  priceRefreshInterval: "1m",
};

export function useSettings() {
  const [settings, setSettingsState] = useState<FundSettings>(DEFAULTS);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<FundSettings> & { quotePollingVersion?: number };
        const settings = { ...DEFAULTS, ...parsed };
        // Previously "manual" was stored even when only an unrelated setting
        // changed, and the polling preference had no effect.
        if (!parsed.quotePollingVersion && settings.priceRefreshInterval === "manual") {
          settings.priceRefreshInterval = "1m";
        }
        setSettingsState(settings);
      }
    } catch {
      // ignore
    }
    setHydrated(true);
  }, []);

  const update = useCallback((patch: Partial<FundSettings>) => {
    setSettingsState((prev) => {
      const next = { ...prev, ...patch };
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...next, quotePollingVersion: 1 }));
      } catch {
        // ignore
      }
      return next;
    });
  }, []);

  return { settings, update, hydrated };
}
