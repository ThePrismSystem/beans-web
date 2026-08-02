---
# bf-b9te
title: Cross-origin guard rejects all writes behind a TLS-terminating reverse proxy
status: completed
type: bug
priority: high
created_at: 2026-08-02T14:37:59Z
updated_at: 2026-08-02T14:54:50Z
---

## Summary

The cross-origin guard added in v0.1.0 (`apps/server/src/routes/security.ts`) fails
every state-changing request with `403 cross-origin request rejected` when the app
runs behind a TLS-terminating reverse proxy. That takes the UI's reads down too:
`apps/web/src/api/client.ts` sends GraphQL queries as `POST`, so only the REST
`GET`s (`/api/projects`, `/api/search`, `/api/analytics`) survive. The project list
renders with its counts and opening a project shows nothing.

Found in a live deployment behind Traefik (TLS terminated at the proxy, plain HTTP to
the container) at `https://beans.<domain>`.

## Root cause

`registerSecurity()` compares the browser's `Origin` header against the server's own
origin, derived from the inbound request URL:

```ts
const origin = c.req.header("origin");
if (origin !== undefined && origin !== new URL(c.req.url).origin) {
  return c.json({ errors: [{ message: "cross-origin request rejected" }] }, 403);
}
```

Behind a TLS-terminating proxy the browser sends `Origin: https://beans.example.com`,
but the proxy forwards to the container over plain HTTP. `@hono/node-server` builds
`c.req.url` from the actual connection, so `new URL(c.req.url).origin` evaluates to
`http://beans.example.com`. The host matches; the **scheme** does not. Every non-GET
`/api/*` request is refused.

`apps/server/src/env.ts` has no proxy-awareness at all. There is no `TRUST_PROXY`
setting, and nothing anywhere in `apps/` reads `X-Forwarded-Proto` or
`X-Forwarded-Host` (`grep -rn 'x-forwarded\|trustProxy' apps/ --include=*.ts` returns
nothing).

## Reproduction

Against a running container on `:4780`, simulating exactly what Traefik forwards:

```bash
Q='{"query":"{ beans(filter: {}) { id } }"}'

# A. baseline POST, no Origin header
curl -s -o /dev/null -w '%{http_code}\n' -X POST \
  -H 'Content-Type: application/json' --data "$Q" \
  http://HOST:4780/api/projects/PROJECT/graphql
# => 200

# B. what a real browser through Traefik sends
curl -s -o /dev/null -w '%{http_code}\n' -X POST \
  -H 'Host: beans.example.com' -H 'Origin: https://beans.example.com' \
  -H 'X-Forwarded-Proto: https' \
  -H 'Content-Type: application/json' --data "$Q" \
  http://HOST:4780/api/projects/PROJECT/graphql
# => 403 {"errors":[{"message":"cross-origin request rejected"}]}

# C. identical to B but with an http Origin (scheme matches the internal connection)
curl -s -o /dev/null -w '%{http_code}\n' -X POST \
  -H 'Host: beans.example.com' -H 'Origin: http://beans.example.com' \
  -H 'Content-Type: application/json' --data "$Q" \
  http://HOST:4780/api/projects/PROJECT/graphql
# => 200
```

B vs C isolates it to the scheme comparison.

## Proposed fix

Make the expected origin proxy-aware, gated behind explicit opt-in so the default
(direct exposure) keeps its current strictness.

1. Add `TRUST_PROXY` to `apps/server/src/env.ts`: boolean, defaulting to `false`.
2. In `security.ts`, compute the expected origin as:
   - `TRUST_PROXY=false` (default): current behaviour, `new URL(c.req.url).origin`.
   - `TRUST_PROXY=true`: prefer `X-Forwarded-Proto` / `X-Forwarded-Host` when present,
     falling back to the request URL's scheme/host. Take only the first
     comma-separated value of each (proxies append, so `X-Forwarded-Proto: https, http`
     is possible) and trim.
3. Never trust the forwarded headers unconditionally. With `TRUST_PROXY=false` an
   attacker who can reach the server directly could otherwise forge
   `X-Forwarded-Proto` to satisfy the check and defeat the CSRF guard entirely. That
   is the entire reason for the flag: the operator asserts that a trusted proxy is
   the only way in.

Why not just strip `Origin` at the proxy: with an SSO forward-auth layer the session
cookie still rides along on a cross-site POST, so this guard is the actual CSRF
defense for proxied deployments. It should be made to work correctly, not bypassed.

## Acceptance criteria

- [x] `TRUST_PROXY` added to `env.ts`, defaults to `false`, documented in `.env.example`
- [x] `security.ts` honors `X-Forwarded-Proto` / `X-Forwarded-Host` only when `TRUST_PROXY=true`
- [x] First comma-separated value used for each forwarded header; values trimmed
- [x] Unit tests: default-off rejects forged `X-Forwarded-Proto`; on, accepts a correct https Origin; on, still rejects a genuinely foreign Origin; multi-value and whitespace forms handled
- [x] Integration test reproducing case B above returning 200 with `TRUST_PROXY=true`
- [x] Case A (no Origin) and case C keep working in both modes
- [x] README container-configuration table gains a `TRUST_PROXY` row
- [x] README "Behind a reverse proxy" section documents that proxied deployments need it
- [x] `docs/SECURITY.md` "Transport hardening" updated to describe the proxy-aware comparison and why it is opt-in
- [x] `CHANGELOG.md` entry

## Notes

- `GET`/`HEAD` are exempt by design, so the REST reads and the SSE stream at
  `/api/events` were unaffected (200, `text/event-stream`, no buffering through the
  proxy). GraphQL reads are `POST`s and were not exempt.
- No Compose-side change is required or sufficient; this is an app-layer fix.
- Discovered 2026-08-02 while auditing a mediabox-dc deployment after rebuilding the
  image onto v0.1.0. The previously running image predated the security work, which is
  why the deployment had been writing fine until the rebuild.

## Summary of Changes

Shipped as v0.1.1. Implemented the proposed fix as specified.

`TRUST_PROXY` is a `zod` enum over `true`/`false`/`1`/`0` rather than a coerced
boolean, so a typo fails at boot. A coerced boolean would treat one as false and
leave the operator with the same silent breakage this bug caused. The value reaches
the guard through `AppDeps.trustProxy`, which keeps `registerSecurity` free of a
direct `env` import and lets the tests drive both modes.

`security.ts` gained `expectedOrigin(c, trustProxy)`. With the flag off it returns
`new URL(c.req.url).origin` unchanged. With it on, it takes the first comma-separated
value of `X-Forwarded-Proto` / `X-Forwarded-Host`, each falling back to the connection
when the header is absent or empty after trimming. The `403` body now names
`TRUST_PROXY`, but only when the flag is off, since suggesting it to an operator who
already set it is wrong advice.

Twelve new tests in `security.test.ts` and five in `env.test.ts`. The proxy cases run
against a full request URL (`http://beans.example.com/...`) so the guard sees the
plain-HTTP internal hop from case B, which reproduces the bug in-process without a
live proxy. Also covered: the forged-header regression with the flag off, a proxy
that rewrites `Host` to an internal name, and an empty forwarded value.

Docs went into both README config tables, a "Behind a reverse proxy" paragraph naming
the symptom (project list loads, project opens empty), a `docs/SECURITY.md` "Transport
hardening" bullet on why the flag is opt-in, `.env.example`, `Dockerfile`,
`docker-compose.yml`, and the `CHANGELOG.md` 0.1.1 entry.

Corrected one claim in the report above: reads did not still work. The UI's GraphQL
queries are `POST`s, which is why opening a project failed and not just editing.
