"use client";

import { callGpApi, type GpResult } from "@/lib/gp-api";
import type { FundingPlan } from "@/lib/funding-day";
import type { FundingRound, FundingRoundPatch } from "@/lib/funding-round";

// Client for /api/funding/*. The error branch can carry the server's
// latest round, a fresh plan and fingerprint (409s) or plan errors (422).
export type FundingResult<T> = GpResult<T> & {
  round?: FundingRound;
  plan?: FundingPlan;
  fingerprint?: string;
  errors?: string[];
};

const call = <T,>(path: string, body: Record<string, unknown>) =>
  callGpApi<T>(path, body) as Promise<FundingResult<T>>;

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
