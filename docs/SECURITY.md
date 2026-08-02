# Security

## Reporting a vulnerability

Open a GitHub issue, or contact the maintainer directly for anything you'd rather not post
publicly.

## Audit scope and findings (2026-07-31)

This covers the app's actual attack surface: path traversal, command injection, and the
authentication model. It is not a line-by-line review of every file.

A follow-up STRIDE/OWASP audit on 2026-08-01 surfaced an argument-injection jail escape and
several hardening gaps; all were fixed on the `fix/security-audit-hardening` branch. The
relevant sections below have been updated to reflect the current state.

### Dependency vulnerabilities

`pnpm audit --audit-level moderate` is run on every CI build (`.github/workflows/ci.yml`) and
blocks merges. All findings known at the time of this audit were fixed:

- `fast-uri`, `postcss`, `brace-expansion`, `lodash` were all transitive, resolved by updating
  their direct parent dependencies (or a `pnpm.overrides` pin where the parent's own resolution
  didn't move far enough).
- `@hono/node-server` is a direct dependency, bumped 1.x → 2.x to fix a path-traversal advisory
  in `serve-static` (GHSA-frvp-7c67-39w9).

`pnpm audit --audit-level moderate` currently reports no known vulnerabilities.

### Path traversal

Every filesystem path built from a client-supplied value goes through
`assertWithinRoot()` (`apps/server/src/discovery/scan.ts`), which resolves both the configured
root and the candidate path and throws unless the candidate is the root or strictly under it. The
one route that builds a per-project filesystem path from client input,
`POST /api/projects/:name/graphql` (`apps/server/src/routes/graphql.ts`), looks the project up by
name against the server's own discovered-project list first. The client supplies only a `name`
used as a lookup key, never a raw path, and the resulting path still goes through
`assertWithinRoot()` before use. No other route (`analytics`, `events`, `projects`, `search`)
builds a filesystem path from client input. Static file serving
(`apps/server/src/routes/static.ts`) relies on `@hono/node-server`'s own `serveStatic` traversal
guard, patched as above.

Discovery dedups projects across configured roots by comparing `path.resolve()`d strings, not
`realpath()`, so two roots that reach the same physical directory through different symlinks are
treated as distinct projects rather than deduped. This has no security impact: each entry still
validates correctly against the specific root it was discovered under, so the path-jail guarantee
above holds regardless.

### Information disclosure

`GET /api/projects` returns only each project's `name`, `prefix`, and bean `counts`. The host
filesystem details — the absolute `path` and the configured `root` a project was discovered under —
are held on a server-internal `ProjectRecord` and projected out before the response reaches a
client, so they no longer travel over the wire. (Server-side, those fields are still used to
resolve each project's `.beans.yml` and to enforce the path jail.)

### Command and argument injection

The `beans` CLI is invoked via `execFile` (`apps/server/src/beans/executor.ts`), which does not
spawn a shell. `buildBeansArgs` assembles the arguments as an array and hands them straight to
`execFileAsync` with no string interpolation, so nothing can be reinterpreted as shell syntax —
_shell_ injection is not possible.

Separately, _argument_ injection is prevented by passing the client-supplied GraphQL query after a
`--` end-of-options separator. Without it, a query beginning with `-` (e.g. `--beans-path=/etc`)
was parsed by the `beans` CLI as a flag and could redirect it to read outside the configured jail;
after `--`, every remaining token is a positional, so such a query is treated as a literal
(invalid) GraphQL string and rejected. This is distinct from — and not covered by — the shell-safety
argument above.

### Transport hardening

- **Cross-origin requests:** state-changing (`/api/*`, non-GET/HEAD) requests must carry an
  `application/json` content-type — which refuses a no-preflight `text/plain` simple request — and,
  when an `Origin` header is present, it must match the server's own origin
  (`apps/server/src/routes/security.ts`). GET/HEAD reads are left open; their responses are never
  cross-origin readable.
- **Proxy-aware origin comparison:** "the server's own origin" comes from the inbound connection,
  which behind a TLS-terminating proxy is the internal plain-HTTP hop rather than the public URL the
  browser used. `TRUST_PROXY=true` (`apps/server/src/env.ts`) switches the comparison to the first
  value of `X-Forwarded-Proto` and `X-Forwarded-Host`, falling back to the connection when a header
  is absent or empty. It defaults to `false`: a client that can reach the port directly can set
  those headers to anything, so trusting them unconditionally would let that client satisfy the
  check and the guard would stop meaning anything. Turning the flag on asserts that no such direct
  path exists. Nothing else in the server reads forwarded headers.
- **Security headers:** all responses carry `secureHeaders` defaults (`nosniff`, `X-Frame-Options`)
  plus a self-only Content-Security-Policy with `frame-ancestors 'none'` (`apps/server/src/app.ts`).
- **Request body cap:** the graphql route rejects bodies over 256 KB with `413` before parsing.
- **Subprocess timeout:** each `beans` invocation has a 15 s timeout and is `SIGKILL`ed on expiry,
  so a child that blocks (e.g. on stdin) cannot leak a process slot.

### No authentication

`beans-frontend` has no authentication or authorization layer (`apps/server/src/env.ts`). It's a
local-first, single-user tool intended to run on `127.0.0.1`, which is the default `HOST` binding,
though an operator can change `HOST` through the environment. **Setting `HOST` to a non-loopback
address exposes the API to anything that can reach that address, with no access control. That
includes full read AND write of every bean under the configured `GIT_ROOT` roots via GraphQL
queries and mutations.** The cross-origin guard above stops a browser on another site from driving
those mutations, but it is not a substitute for authentication against a direct client. Don't
expose `HOST` outside a trusted, isolated network — put a real auth layer (e.g. an SSO proxy) in
front of it if you must.
