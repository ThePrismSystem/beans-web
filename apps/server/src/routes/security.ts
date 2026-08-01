import type { Hono } from "hono";

const JSON_CONTENT_TYPE = "application/json";

/**
 * Guards state-changing (`/api/*`, non-GET/HEAD) requests against CSRF: it
 * requires a JSON content-type — so a no-preflight `text/plain` simple request
 * is refused — and, when an `Origin` header is present, that it matches the
 * server's own origin. GET/HEAD are left open: their responses are never
 * cross-origin readable, so they carry no CSRF risk.
 */
export function registerSecurity(app: Hono): void {
  app.use("/api/*", async (c, next) => {
    if (c.req.method === "GET" || c.req.method === "HEAD") return next();

    const contentType = (c.req.header("content-type") ?? "").toLowerCase();
    if (!contentType.includes(JSON_CONTENT_TYPE)) {
      return c.json({ errors: [{ message: "content-type must be application/json" }] }, 415);
    }

    const origin = c.req.header("origin");
    if (origin !== undefined && origin !== new URL(c.req.url).origin) {
      return c.json({ errors: [{ message: "cross-origin request rejected" }] }, 403);
    }

    return next();
  });
}
