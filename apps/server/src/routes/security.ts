import type { Context, Hono } from "hono";

const JSON_CONTENT_TYPE = "application/json";

/**
 * Each proxy in a chain appends to `X-Forwarded-*`, so the first value is the one
 * describing the original client. Returns `undefined` for a missing or empty
 * header so the caller can fall back to the connection itself.
 */
function firstHop(raw: string | undefined): string | undefined {
  const first = raw?.split(",")[0]?.trim();
  return first !== undefined && first.length > 0 ? first : undefined;
}

/**
 * The origin a browser should have sent. A TLS-terminating proxy talks to us over
 * plain HTTP, so the connection's own scheme and host describe the internal hop
 * rather than the public URL the browser used, and `X-Forwarded-*` carries the
 * real one. Only an operator who knows a proxy is the only way in may trust those
 * headers: anything that can reach the server directly can forge them, which
 * would leave the guard checking a value the caller controls.
 */
function expectedOrigin(c: Context, trustProxy: boolean): string {
  const url = new URL(c.req.url);
  if (!trustProxy) return url.origin;
  const proto = firstHop(c.req.header("x-forwarded-proto")) ?? url.protocol.slice(0, -1);
  const host = firstHop(c.req.header("x-forwarded-host")) ?? url.host;
  return `${proto}://${host}`;
}

/**
 * Guards state-changing (`/api/*`, non-GET/HEAD) requests against CSRF: it
 * requires a JSON content-type — so a no-preflight `text/plain` simple request
 * is refused — and, when an `Origin` header is present, that it matches the
 * server's own origin. GET/HEAD are left open: their responses are never
 * cross-origin readable, so they carry no CSRF risk.
 */
export function registerSecurity(app: Hono, trustProxy: boolean): void {
  app.use("/api/*", async (c, next) => {
    if (c.req.method === "GET" || c.req.method === "HEAD") return next();

    const contentType = (c.req.header("content-type") ?? "").toLowerCase();
    if (!contentType.includes(JSON_CONTENT_TYPE)) {
      return c.json({ errors: [{ message: "content-type must be application/json" }] }, 415);
    }

    const origin = c.req.header("origin");
    if (origin !== undefined && origin !== expectedOrigin(c, trustProxy)) {
      // Every write failing with an opaque 403 behind a proxy is hard to place,
      // so name the setting that fixes it — but only when it isn't already on.
      const hint = trustProxy ? "" : " (set TRUST_PROXY=true if behind a reverse proxy)";
      return c.json({ errors: [{ message: `cross-origin request rejected${hint}` }] }, 403);
    }

    return next();
  });
}
