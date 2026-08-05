/**
 * The two request-level outcomes every `beans`-backed route shares: the slot
 * queue had no room, and the client hung up. Neither is a per-project failure,
 * and neither should be answered differently by /api/search, /api/analytics
 * and the graphql route, which all sit behind the same process-wide gate.
 *
 * Only the pieces that must agree across routes live here. The response bodies
 * do not: the graphql route's client (`apps/web/src/api/client.ts`) calls
 * `res.json()` without checking `res.ok`, so that route has to answer in its
 * `{ errors: [...] }` shape, while the others follow `events.ts` and answer
 * plain text.
 */

/**
 * `Retry-After`, in seconds, for a request the queue had no room for. The
 * worst case is `(MAX_QUEUED_FOR_SLOT / BEANS_CONCURRENCY) *
 * BEANS_EXEC_TIMEOUT_MS` = 120 s, but that assumes every running child burns
 * its full timeout; an ordinary `beans` invocation is milliseconds, so a short
 * backoff sheds the spike without making a blip look like an outage.
 */
export const QUEUE_FULL_RETRY_AFTER = { "Retry-After": "5" };

/** nginx's non-IANA "Client Closed Request". */
const HTTP_CLIENT_CLOSED_REQUEST = 499;

/**
 * Closes out a request whose client has already gone away.
 *
 * Built as a raw `Response` because 499 is not in Hono's status union and the
 * alternative would be a cast. The body is empty by definition - there is
 * nobody left to read one.
 *
 * The value is in the access log. Letting the abort rejection propagate would
 * make every abandoned request a 500 with a stack trace, so a burst of clients
 * leaving would read as a server fault; and the audit's burst was 200 requests
 * at once.
 */
export function clientClosedRequest(): Response {
  return new Response(null, { status: HTTP_CLIENT_CLOSED_REQUEST });
}
