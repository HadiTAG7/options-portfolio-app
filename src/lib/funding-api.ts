"use client";

import { firebaseAuth } from "@/lib/firebase";
import { apiUrl } from "@/lib/api-base";
import type { FundingPlan } from "@/lib/funding-day";
import type { FundingRound, FundingRoundPatch } from "@/lib/funding-round";

// Client for /api/funding/*. Every call carries a fresh ID token (the
// server checks the gp claim) and goes through apiUrl, so it works from
// Firebase Hosting and the APK as well as Vercel.

export type FundingResult<T> =
  | ({ ok: true; serverTime: string } & T)
  | { ok: false; error: string; code?: string; status: number; serverTime?: string; round?: FundingRound; plan?: FundingPlan; fingerprint?: string; errors?: string[] };

async function call<T>(path: string, body: Record<string, unknown>): Promise<FundingResult<T>> {
  const user = firebaseAuth().currentUser;
  const token = user ? await user.getIdToken() : null;
  if (!token) return { ok: false, error: "سجّل الدخول كمدير أولاً", status: 401 };
  let res: Response;
  try {
    res = await fetch(apiUrl(path), {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
  } catch {
    return { ok: false, error: `تعذّر الاتصال بالخادم (${apiUrl(path)})`, status: 0 };
  }
  let data: Record<string, unknown> = {};
  try {
    data = (await res.json()) as Record<string, unknown>;
  } catch {
    return { ok: false, error: `رد غير صالح من الخادم (HTTP ${res.status})`, status: res.status };
  }
  if (!res.ok || data.ok !== true) {
    return { ...(data as object), ok: false, error: String(data.error ?? `HTTP ${res.status}`), status: res.status } as FundingResult<T>;
  }
  return data as FundingResult<T>;
}

export const fundingApi = {
  current: () => call<{ round: FundingRound | null }>("/api/funding/round", { action: "current" }),
  list: () => call<{ rounds: FundingRound[] }>("/api/funding/round", { action: "list" }),
  create: (sarPerUsd: number) =>
    call<{ round: FundingRound }>("/api/funding/round", { action: "create", sarPerUsd }),
  save: (roundId: string, baseVersion: number, patch: FundingRoundPatch) =>
    call<{ round: FundingRound }>("/api/funding/round", { action: "save", roundId, baseVersion, patch }),
  cancel: (roundId: string) => call<{ round: FundingRound }>("/api/funding/round", { action: "cancel", roundId }),
  preview: (roundId: string) =>
    call<{ round: FundingRound; plan: FundingPlan; fingerprint: string }>("/api/funding/execute", {
      roundId,
      dryRun: true,
    }),
  execute: (roundId: string, baseVersion: number, fingerprint: string) =>
    call<{ round: FundingRound; alreadyExecuted: boolean; plan: FundingPlan | null }>("/api/funding/execute", {
      roundId,
      baseVersion,
      fingerprint,
    }),
  undo: (roundId: string) => call<{ round: FundingRound }>("/api/funding/undo", { roundId }),
};
