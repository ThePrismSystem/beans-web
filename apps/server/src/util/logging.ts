/**
 * `hono/logger` logs the full request path, including its query string — its
 * implementation slices the path straight out of the request URL, query and
 * all. `/api/search?q=…` carries the user's search text, the same class of
 * bean content the GraphQL query and variables are kept out of logs for.
 * Stripping the query here, in the log line itself, keeps the trace (method,
 * path, status, timing) while dropping the content.
 */
export function withoutQuery(message: string): string {
  return message.replace(/(\s\/\S*?)\?\S*/, "$1");
}

/**
 * The one place in this codebase allowed to call `console.log` directly —
 * `no-console` blocks it everywhere else so a stray debug statement never
 * ships (see the matching eslint override for this file). `hono/logger`'s
 * request trace is routed through here so it can pass through `withoutQuery`
 * first.
 */
export function writeLog(message: string): void {
  console.log(message);
}
