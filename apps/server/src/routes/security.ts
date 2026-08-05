import type { Hono } from "hono";

const JSON_CONTENT_TYPE = "application/json";
const HTTP_UNSUPPORTED_MEDIA_TYPE = 415;
const HTTP_FORBIDDEN = 403;
const HTTP_MISDIRECTED_REQUEST = 421;

// Hostnames a request may target without an operator opting in via
// ALLOWED_HOSTS: the loopback names/addresses a directly-run server binds by
// default. The IPv6 loopback is listed only in its bracketed form, because
// that's the only form hostnameOnly() ever produces from a Host header — a
// bare "::1" would never be compared against, so listing it would be dead.
const DEFAULT_ALLOWED_HOSTS = ["localhost", "127.0.0.1", "[::1]"];

/**
 * The slice of Hono's `Context` that origin-checking needs. Typed narrowly
 * (rather than importing `Context` itself) so a call site's concretely-typed
 * context structurally satisfies this without any `any` flowing through
 * Hono's default generic parameters.
 */
interface OriginContext {
  req: {
    url: string;
    header: (name: string) => string | undefined;
  };
}

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
 * Strips the port from a `Host`-style value (`host` or `host:port`, including
 * a bracketed IPv6 literal) so the port an operator happens to run on can't
 * affect the allowlist decision, and lower-cases it since hostnames are
 * case-insensitive. Returns undefined when the value doesn't parse as a host
 * at all, which the caller treats as disallowed.
 */
function hostnameOnly(value: string): string | undefined {
  try {
    return new URL(`http://${value}`).hostname.toLowerCase();
  } catch {
    return undefined;
  }
}

/**
 * The origin a browser should have sent. A TLS-terminating proxy talks to us over
 * plain HTTP, so the connection's own scheme and host describe the internal hop
 * rather than the public URL the browser used, and `X-Forwarded-*` carries the
 * real one. Only an operator who knows a proxy is the only way in may trust those
 * headers: anything that can reach the server directly can forge them, which
 * would leave the guard checking a value the caller controls.
 */
function expectedOrigin(c: OriginContext, trustProxy: boolean): string {
  const url = new URL(c.req.url);
  if (!trustProxy) return url.origin;
  const proto = firstHop(c.req.header("x-forwarded-proto")) ?? url.protocol.slice(0, -1);
  const host = firstHop(c.req.header("x-forwarded-host")) ?? url.host;
  return `${proto}://${host}`;
}

/**
 * Blocks DNS rebinding. `expectedOrigin` above computes the origin a browser
 * "should have" sent from `c.req.url`, but `@hono/node-server` builds that
 * URL from the same client-controlled `Host` header the `Origin` header is
 * compared against — so under rebinding (a page on attacker-controlled DNS
 * that resolves to this server) both sides of that comparison move together
 * and it proves nothing. This checks `Host` itself against a
 * server-controlled list instead, which the client cannot move to match.
 *
 * Applies to every method, including GET/HEAD. That is the key difference
 * from the CSRF guard below, which deliberately exempts GET because a
 * cross-origin page can never read a GET response — but under rebinding the
 * attacker page IS same-origin, so it can read GET responses freely.
 * Exempting GET here would leave that read path wide open.
 *
 * Under TRUST_PROXY, both the real connection `Host` and the forwarded one
 * must be allowed — not the forwarded one alone. Unlike `Origin`,
 * `X-Forwarded-Host` is an ordinary header a browser fetch can set freely
 * with no preflight, so a rebound page could otherwise satisfy the
 * allowlist by forging it (e.g. `X-Forwarded-Host: localhost`) regardless of
 * what `Host` it actually connected with. Requiring the connection `Host` to
 * also pass means forging the forwarded one buys nothing: the connection
 * `Host` is still the attacker's own domain, and that alone fails.
 */
function registerHostAllowlist(app: Hono, trustProxy: boolean, allowedHosts: string[]): void {
  // A port in an operator's ALLOWED_HOSTS entry would otherwise never match,
  // since every value compared against it has already had its port
  // stripped — normalize configured entries through the same path.
  const configured = allowedHosts.map(hostnameOnly).filter((h): h is string => h !== undefined);
  const allowed = new Set([...DEFAULT_ALLOWED_HOSTS, ...configured]);
  app.use("/api/*", async (c, next) => {
    const url = new URL(c.req.url);
    const candidates = [url.host];
    if (trustProxy) {
      const forwarded = firstHop(c.req.header("x-forwarded-host"));
      if (forwarded !== undefined) candidates.push(forwarded);
    }
    const allAllowed = candidates.every((raw) => {
      const host = hostnameOnly(raw);
      return host !== undefined && allowed.has(host);
    });
    if (!allAllowed) {
      // A proxied deployment needs both hosts listed, which is easy to miss
      // the first time TRUST_PROXY is turned on — say so here rather than
      // leaving an operator to guess why ALLOWED_HOSTS alone didn't help.
      const hint = trustProxy
        ? "; with TRUST_PROXY on, list both the internal host your proxy dials and the public one it forwards"
        : "";
      return c.json(
        {
          errors: [{ message: `unrecognized Host header (set ALLOWED_HOSTS to allow it)${hint}` }],
        },
        HTTP_MISDIRECTED_REQUEST,
      );
    }
    return next();
  });
}

/**
 * Guards state-changing (`/api/*`, non-GET/HEAD) requests against CSRF: it
 * requires a JSON content-type — so a no-preflight `text/plain` simple request
 * is refused — and requires an `Origin` header that matches the server's own
 * origin. GET/HEAD are left open: their responses are never cross-origin
 * readable, so they carry no CSRF risk.
 */
function registerCrossOriginGuard(app: Hono, trustProxy: boolean): void {
  app.use("/api/*", async (c, next) => {
    if (c.req.method === "GET" || c.req.method === "HEAD") return next();

    // Compare the MIME essence, not the raw header: `includes()` also matches
    // a parameter, and `multipart/form-data; boundary=application/json` is
    // CORS-safelisted, so it would satisfy the check without a preflight.
    const essence = (c.req.header("content-type") ?? "").split(";")[0]?.trim().toLowerCase();
    if (essence !== JSON_CONTENT_TYPE) {
      return c.json(
        { errors: [{ message: "content-type must be application/json" }] },
        HTTP_UNSUPPORTED_MEDIA_TYPE,
      );
    }

    // A missing Origin used to pass through unchecked, on the assumption
    // that only a non-browser client omits it. A rebinding attack runs from
    // a real browser, which always sends Origin on a state-changing
    // request, so that leniency never protected a legitimate case the check
    // below doesn't already cover — it only widened the hole. Treat absence
    // as a rejection.
    const origin = c.req.header("origin");
    if (origin === undefined || origin !== expectedOrigin(c, trustProxy)) {
      // Every write failing with an opaque 403 behind a proxy is hard to place,
      // so name the setting that fixes it — but only when it isn't already on.
      const hint = trustProxy ? "" : " (set TRUST_PROXY=true if behind a reverse proxy)";
      return c.json(
        { errors: [{ message: `cross-origin request rejected${hint}` }] },
        HTTP_FORBIDDEN,
      );
    }

    return next();
  });
}

export function registerSecurity(app: Hono, trustProxy: boolean, allowedHosts: string[]): void {
  registerHostAllowlist(app, trustProxy, allowedHosts);
  registerCrossOriginGuard(app, trustProxy);
}
