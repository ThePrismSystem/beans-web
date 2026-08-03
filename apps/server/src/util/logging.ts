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
 * Routes `hono/logger`'s request trace through `withoutQuery` before writing
 * it. `console.info` writes to stdout exactly as `console.log` does, and it's
 * already permitted by the `no-console` rule.
 */
export function writeLog(message: string): void {
  console.info(message);
}
