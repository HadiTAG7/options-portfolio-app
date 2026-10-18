import { corsPreflight, withCors } from "@/lib/cors";
import { gpRoute } from "@/lib/server/gp-route";
import { mergePosition } from "@/lib/server/stocks-service";

// { ticker } → collapse duplicate rows of one ticker into one position.
async function handlePost(request: Request) {
  return gpRoute(
    request,
    async ({ db, body }) => ({ result: await mergePosition(db, body.ticker) }),
    { firebaseOnlyMessage: "دمج المراكز يعمل مع Firebase فقط" }
  );
}

export function OPTIONS(request: Request) {
  return corsPreflight(request);
}

export async function POST(request: Request) {
  return withCors(request, await handlePost(request));
}
