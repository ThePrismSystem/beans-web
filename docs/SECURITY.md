# Security

## Reporting a vulnerability

Open a GitHub issue, or contact the maintainer directly for anything you'd rather not post
publicly.

## Audit scope and findings (2026-07-31)

This covers the app's actual attack surface: path traversal, command injection, and the
authentication model. It is not a line-by-line review of every file.

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

`GET /api/projects` returns each project's absolute `path` on the host filesystem, and now also
its `root`, the specific configured `GIT_ROOT` entry it was discovered under. Both are internal
filesystem details of the host rather than secrets, but neither is meant for anything beyond a
trusted caller. That is another reason to keep `HOST` loopback-only (see below).

### Command injection

The `beans` CLI is invoked via `execFile` (`apps/server/src/beans/executor.ts`), which does not
spawn a shell. `buildBeansArgs` assembles the arguments as an array and hands them straight to
`execFileAsync` with no string interpolation, so nothing can be reinterpreted as shell syntax, even
when an argument holds a user-supplied GraphQL query or variables.

### No authentication

`beans-frontend` has no authentication or authorization layer (`apps/server/src/env.ts`). It's a
local-first, single-user tool intended to run on `127.0.0.1`, which is the default `HOST` binding,
though an operator can change `HOST` through the environment. **Setting `HOST` to a non-loopback
address exposes the API to anything that can reach that address, with no access control. That
includes arbitrary-path GraphQL queries scoped to whichever `GIT_ROOT` roots were configured.**
Don't do this outside a trusted, isolated network.
