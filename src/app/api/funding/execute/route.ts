import { corsPreflight, withCors } from "@/lib/cors";
import { fundingRoute } from "@/lib/server/funding-route";
import { FundingError, executeRound, previewRound } from "@/lib/server/funding-service";

// { roundId, dryRun: true } → the authoritative preview + its fingerprint.
// { roundId, baseVersion, fingerprint } → execute, atomically, only if the
// state still produces exactly the previewed plan.
async function handlePost(request: Request) {
  return fundingRoute(request, async ({ db, uid, body }) => {
    const roundId = typeof body.roundId === "string" ? body.roundId : "";
    if (!roundId) throw new FundingError("طلب غير مكتمل", 400, "bad_request");
    if (body.dryRun === true) {
      return await previewRound(db, roundId);
    }
    const baseVersion = Number(body.baseVersion);
    const fingerprint = typeof body.fingerprint === "string" ? body.fingerprint : "";
    if (!Number.isInteger(baseVersion) || !fingerprint) {
      throw new FundingError("التنفيذ يتطلب معاينة أولاً", 400, "bad_request");
    }
    return await executeRound(db, uid, roundId, baseVersion, fingerprint);
  });
}

export function OPTIONS(request: Request) {
  return corsPreflight(request);
}

export async function POST(request: Request) {
  return withCors(request, await handlePost(request));
}
