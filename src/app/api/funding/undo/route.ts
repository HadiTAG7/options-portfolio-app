import { corsPreflight, withCors } from "@/lib/cors";
import { fundingRoute } from "@/lib/server/funding-route";
import { FundingError, undoRound } from "@/lib/server/funding-service";

// { roundId } → reverse an executed funding day as one unit (books only).
async function handlePost(request: Request) {
  return fundingRoute(request, async ({ db, uid, body }) => {
    const roundId = typeof body.roundId === "string" ? body.roundId : "";
    if (!roundId) throw new FundingError("طلب غير مكتمل", 400, "bad_request");
    return { round: await undoRound(db, uid, roundId) };
  });
}

export function OPTIONS(request: Request) {
  return corsPreflight(request);
}

export async function POST(request: Request) {
  return withCors(request, await handlePost(request));
}
