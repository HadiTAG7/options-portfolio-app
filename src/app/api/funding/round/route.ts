import { corsPreflight, withCors } from "@/lib/cors";
import { fundingRoute } from "@/lib/server/funding-route";
import {
  FundingError,
  cancelDraft,
  createDraft,
  getCurrentDraft,
  listRounds,
  saveDraft,
} from "@/lib/server/funding-service";
import { sanitizePatch } from "@/lib/funding-round";

// Funding-round drafts: { action: current | create | save | cancel | list }.
// Requests collected over days live here, server-side, so the GP sees the
// same draft from the phone and the computer. POST-only (the static
// export skips non-GET handlers).
async function handlePost(request: Request) {
  return fundingRoute(request, async ({ db, uid, body }) => {
    const action = String(body.action ?? "");
    const roundId = typeof body.roundId === "string" ? body.roundId : "";
    switch (action) {
      case "current":
        return { round: await getCurrentDraft(db) };
      case "list":
        return { rounds: await listRounds(db) };
      case "create":
        return { round: await createDraft(db, uid, Number(body.sarPerUsd) || null) };
      case "save": {
        const clean = sanitizePatch(body.patch);
        if ("error" in clean) throw new FundingError(clean.error, 400, "bad_patch");
        const baseVersion = Number(body.baseVersion);
        if (!roundId || !Number.isInteger(baseVersion)) {
          throw new FundingError("طلب غير مكتمل", 400, "bad_request");
        }
        return { round: await saveDraft(db, uid, roundId, baseVersion, clean.patch) };
      }
      case "cancel":
        if (!roundId) throw new FundingError("طلب غير مكتمل", 400, "bad_request");
        return { round: await cancelDraft(db, uid, roundId) };
      default:
        throw new FundingError("إجراء غير معروف", 400, "bad_action");
    }
  });
}

export function OPTIONS(request: Request) {
  return corsPreflight(request);
}

export async function POST(request: Request) {
  return withCors(request, await handlePost(request));
}
