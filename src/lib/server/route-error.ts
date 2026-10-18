// A typed error a server route maps to an HTTP status. Thrown inside a
// Firestore transaction it aborts without a retry (only contention
// retries), so nothing is written.
export class RouteError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
    readonly payload?: unknown
  ) {
    super(message);
  }
}
