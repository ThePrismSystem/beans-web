# Security

## Reporting a vulnerability

Open a GitHub issue, or contact the maintainer directly for anything you'd rather not post
publicly.

## Audit scope and findings (2026-07-31)

This covers the app's actual attack surface — path traversal, command injection, and the
authentication model — not a line-by-line review of every file.

### Dependency vulnerabilities

`pnpm audit --audit-level moderate` is run on every CI build (`.github/workflows/ci.yml`) and
blocks merges. All findings known at the time of this audit were fixed:

- `fast-uri`, `postcss`, `brace-expansion`, `lodash` — transitive, resolved by updating their
  direct parent dependencies (or a `pnpm.overrides` pin where the parent's own resolution didn't
  move far enough).
- `@hono/node-server` — direct dependency, bumped 1.x → 2.x to fix a path-traversal advisory in
  `serve-static` (GHSA-frvp-7c67-39w9).

`pnpm audit --audit-level moderate` currently reports no known vulnerabilities.

### Path traversal

Every filesystem path built from a client-supplied value goes through
`assertWithinRoot()` (`apps/server/src/discovery/scan.ts`), which resolves both the configured
root and the candidate path and throws unless the candidate is the root or strictly under it. The
one route that builds a per-project filesystem path from client input,
`POST /api/projects/:name/graphql` (`apps/server/src/routes/graphql.ts`), looks the project up by
name against the server's own discovered-project list first — the client supplies only a `name`
used as a lookup key, never a raw path — and the resulting path is still passed through
`assertWithinRoot()` before use. No other route (`analytics`, `events`, `projects`, `search`)
builds a filesystem path from client input. Static file serving
(`apps/server/src/routes/static.ts`) relies on `@hono/node-server`'s own `serveStatic` traversal
guard, patched as above.

### Command injection

The `beans` CLI is invoked via `execFile` (`apps/server/src/beans/executor.ts`), which does not
spawn a shell — arguments are passed as an array (`buildBeansArgs`) and passed straight through to
`execFileAsync` with no string interpolation, so they can't be reinterpreted as shell syntax, even
when they contain a user-supplied GraphQL query or variables.

### No authentication

`beans-frontend` has no authentication or authorization layer (`apps/server/src/env.ts`). It's a
local-first, single-user tool intended to run on `127.0.0.1` — the default `HOST` binding, though
`HOST` is operator-configurable via environment variable. **Setting `HOST` to a non-loopback
address exposes the API — including arbitrary-path GraphQL queries scoped to whichever `GIT_ROOT`
roots were configured — to anything that can reach that address, with no access control.** Don't
do this outside a trusted, isolated network.
