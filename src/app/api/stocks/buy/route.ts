import { corsPreflight, withCors } from "@/lib/cors";
import { gpRoute } from "@/lib/server/gp-route";
import { buyIntoPosition } from "@/lib/server/stocks-service";

// { ticker, quantity, price, date } → the position after the buy: folded
// into the existing row at the weighted-average cost, or a new row.
async function handlePost(request: Request) {
  return gpRoute(
    request,
    async ({ db, body }) =>
      buyIntoPosition(db, {
        ticker: body.ticker,
        quantity: body.quantity,
        price: body.price,
        date: body.date,
      }),
    { firebaseOnlyMessage: "دمج المراكز يعمل مع Firebase فقط" }
  );
}

export function OPTIONS(request: Request) {
  return corsPreflight(request);
}

export async function POST(request: Request) {
  return withCors(request, await handlePost(request));
}
