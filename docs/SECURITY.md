# Security

## Reporting a vulnerability

Report it privately, through GitHub's private vulnerability reporting:
**[open a draft security advisory](https://github.com/ThePrismSystem/beans-web/security/advisories/new)**.
A draft advisory is visible only to you and the maintainers, so nothing is disclosed until
there is a fix to disclose alongside it.

Please don't open a public issue for a suspected vulnerability. A public issue tells everyone
about the problem before anyone can fix it, and there is no way to take that back. Ordinary
bugs are still welcome as issues.

A useful report says which version you were running, how the server was reachable (loopback,
LAN, reverse proxy, container), and enough detail to reproduce what you saw.

## Audit scope and findings (2026-07-31)

This covers the app's actual attack surface: path traversal, command injection, and the
authentication model. It is not a line-by-line review of every file.

A follow-up STRIDE/OWASP audit on 2026-08-01 surfaced an argument-injection jail escape and
several hardening gaps; all were fixed on the `fix/security-audit-hardening` branch. The
relevant sections below have been updated to reflect the current state.

A second STRIDE/OWASP audit on 2026-08-02 confirmed every 2026-08-01 finding fixed and
surfaced seven further items — an unbounded subprocess fan-out, host paths in error
messages, a bypassable content-type check, container privileges, an unpinned CLI version,
absent request logging, and uncapped event streams. All were fixed on the
`fix/security-hardening-round-2` branch; the sections below reflect the current state.

### Dependency vulnerabilities

`pnpm audit --audit-level moderate` is run on every CI build (`.github/workflows/ci.yml`) and
blocks merges. All findings known at the time of this audit were fixed:

- `fast-uri`, `postcss`, `brace-expansion`, `lodash` were all transitive, resolved by updating
  their direct parent dependencies (or a `pnpm.overrides` pin where the parent's own resolution
  didn't move far enough).
- `@hono/node-server` is a direct dependency, bumped 1.x → 2.x to fix a path-traversal advisory
  in `serve-static` (GHSA-frvp-7c67-39w9).

`pnpm audit --audit-level moderate` currently reports no known vulnerabilities. That claim was
not true on the date in this heading: a CORS ReDoS in `hono` (GHSA-8j4g-w8fx-2239) was
outstanding and unnoticed, and stayed that way until the version floor was raised past it.
Re-verified clean on 2026-08-05.

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

The jail also covers where each project's **data directory** lives, not just where its
`.beans.yml` lives. `.beans.yml` can set `beans.path` to redirect the CLI's data directory
anywhere on disk, relative to the config file, with no containment of its own — the CLI applies
none. Discovery (`discoverProjects` in `apps/server/src/discovery/scan.ts`) resolves that
directory once per project, and every subsequent `beans` invocation for that project — discovery's
own count query, the graphql route, search, analytics — passes it explicitly as `--beans-path`,
which the CLI honours over whatever `beans.path` says in the config file at the moment the call
actually runs (confirmed against the real binary). This is deliberate: there is no YAML
dependency in this workspace, so `beans.path` is read out of the raw file with a regex parser,
and a regex can always be wrong about some YAML form (multi-line values, block scalars, YAML
anchors and aliases, escape sequences inside a quoted scalar) that the real parser inside the CLI
still resolves correctly. Rather than try to enumerate every such form, the parser's output is
never trusted directly — it only *proposes* a directory, computed once at discovery and reused
for that project's whole cache lifetime rather than re-read per request. The proposal is always
validated: resolved against the project directory, with symlinks resolved (walking up to the
nearest existing ancestor when the directory doesn't exist yet, so a data directory that is
lexically inside the root but is, or sits under, a symlink pointing outside it is still caught),
and rejected if the result escapes the configured root. A project whose resolved directory
genuinely escapes — the confidently-parsed value itself, or the substituted default — is hostile
and is dropped outright, so it cannot break discovery for its siblings. A `beans.path` this
parser can see but can't resolve with confidence is not a rejection, though: the parser falls
back to the CLI's own default (`.beans`) and discovery still enforces it via `--beans-path`, so
the project stays visible (its counts may end up empty until the config is fixed) rather than
either silently disappearing or, worse, letting the unparsed value quietly reach the CLI as a
config value it would honour.

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

Error messages from the `beans` CLI are returned to clients, and the CLI names the file it
failed to load by absolute path. Those paths are reduced to their basenames before the
message leaves the server (`redactPaths`, `apps/server/src/beans/executor.ts`), so an error
still identifies the offending file without disclosing the OS username or the location of
`GIT_ROOT`.

#### GraphQL variables in the host process table

**This is an open exposure, not a closed finding.** Every `beans` child is spawned with its
GraphQL *variables* on its command line (`-v '{"…"}'`), so for as long as that child lives —
milliseconds under normal use, up to the 15 s subprocess timeout at worst — they are readable
from `/proc/<pid>/cmdline`.

What it exposes is whatever the request's variables carry: in practice the user's search text,
and on mutations the title and body of the bean being written. Who can read it is any other
local account on the host, and any process sharing the container's PID namespace. It is not
reachable over the network, and it needs no privilege beyond a local login — reading another
user's `/proc/<pid>/cmdline` is allowed by default on Linux, and `/proc` on a stock install is
mounted without `hidepid`.

The GraphQL *query document* is no longer exposed; it is written to the child's stdin. That
half was worth closing on its own because `POST /api/projects/:name/graphql` passes the
client's own query string straight through, so a caller that puts literal values inline instead of
using variables would otherwise put that data in argv too.

The variables cannot follow it. `beans graphql` (v0.4.2) accepts the query on stdin but offers
no way at all to pass variables off argv: `-v/--variables` takes a literal JSON string, and its
decoder rejects `-`, `@file` and a bare path alike — verified against the binary, along with
the whole flag surface of the subcommand. Inlining the variables into the query document to get
them off argv is not an acceptable workaround either: serializing a multi-line, user-controlled
bean body into a query string reintroduces exactly the injection class that parameterized
variables exist to prevent, which would be a worse bug than this one. Closing this properly
needs an upstream `beans` change.

Two operator mitigations, both checked rather than assumed:

- **Don't share the host's PID namespace.** A Docker container gets its own PID namespace by
  default, and `docker-compose.yml` does not set `pid:`. Running with `pid: host` (or
  `--pid=host`) would expose these command lines to everything else in that namespace.
- **Mount `/proc` with `hidepid`** on a multi-user host, which stops unprivileged users from
  seeing other users' processes at all (`hidepid=2`, or the equivalent `hidepid=invisible` on
  Linux 5.8+). That is a host-level decision affecting every process on the machine, not
  something this project can set for you.

Neither is needed on the deployment this tool is designed for — a single-user machine whose
only local account is the one running it. On a shared host, treat the exposure as real.

### Command and argument injection

The `beans` CLI is invoked via `spawn` (`apps/server/src/beans/executor.ts`), which does not
spawn a shell. `buildBeansArgs` assembles the arguments as an array and hands them straight to
`spawn` with no string interpolation, so nothing can be reinterpreted as shell syntax —
_shell_ injection is not possible.

_Argument_ injection was previously prevented by passing the client-supplied GraphQL query after
a `--` end-of-options separator. Without it, a query beginning with `-` (e.g.
`--beans-path=/etc`) was parsed by the `beans` CLI as a flag and could redirect it to read
outside the configured jail. The query is now written to the child's **stdin** rather than argv
(see _GraphQL variables in the host process table_ above), so there is no positional argument
left for the CLI to reinterpret and the separator has been retired along with the class of bug
it defused. The only client-controlled argument remaining is the value of `-v`, which is
`JSON.stringify` output and is consumed as that flag's argument whatever it contains.

### Transport hardening

- **Host allowlist:** every `/api/*` request — `GET`/`HEAD` included — is checked against a
  server-controlled list of hostnames before anything else runs
  (`apps/server/src/routes/security.ts`). By default only `localhost`, `127.0.0.1`, and `[::1]`
  are accepted; `ALLOWED_HOSTS` (`apps/server/src/env.ts`) adds more for reverse-proxy or LAN
  deployments. Anything else gets `421` before the origin comparison below even runs. This is
  the actual defense against DNS rebinding: a page served from attacker-controlled DNS that
  resolves to this server can make its `Host` and `Origin` headers agree with each other, which
  is all the origin comparison checks, but it cannot make `Host` agree with this list. The
  allowlist covers `GET`/`HEAD` specifically because a rebound page is same-origin as far as the
  browser is concerned, so — unlike a normal cross-origin request — it can read those responses.
  Under `TRUST_PROXY=true` the check requires **both** the real connection `Host` and the
  forwarded one (`X-Forwarded-Host`) to be allowed, not the forwarded one alone: unlike `Origin`,
  `X-Forwarded-Host` is an ordinary header a browser fetch can set with no preflight, so trusting
  it by itself would let a rebound page forge its way past the allowlist (e.g.
  `X-Forwarded-Host: localhost`) regardless of the `Host` it actually connected with.
- **Cross-origin requests:** state-changing (`/api/*`, non-GET/HEAD) requests must have an
  `application/json` content-type — compared by MIME essence, so a CORS-safelisted type
  cannot satisfy it via a parameter — and an `Origin` header that matches the server's own
  origin (`apps/server/src/routes/security.ts`); a missing `Origin` is rejected rather than
  skipped. GET/HEAD reads are left open here on the assumption that their responses are never
  cross-origin readable — an assumption that only holds because the host allowlist above has
  already ruled out DNS rebinding.
- **Proxy-aware origin comparison:** "the server's own origin" comes from the inbound connection,
  which behind a TLS-terminating proxy is the internal plain-HTTP hop rather than the public URL the
  browser used. `TRUST_PROXY=true` (`apps/server/src/env.ts`) switches the comparison to the first
  value of `X-Forwarded-Proto` and `X-Forwarded-Host`, falling back to the connection when a header
  is absent or empty; it also adds the forwarded host to what the allowlist above checks, on top of
  (not instead of) the connection host. It defaults to `false`: a client that can reach the port
  directly can set those headers to anything, so trusting them unconditionally would let that
  client satisfy the check and the guard would stop meaning anything. Turning the flag on asserts
  that no such direct path exists. Nothing else in the server reads forwarded headers.
- **Security headers:** all responses carry `secureHeaders` defaults (`nosniff`, `X-Frame-Options`)
  plus a self-only Content-Security-Policy with `frame-ancestors 'none'` (`apps/server/src/app.ts`).
- **Request body cap:** the graphql route rejects bodies over 256 KB with `413` before parsing.
- **Subprocess timeout:** each `beans` invocation has a 15 s timeout and is `SIGKILL`ed on expiry,
  so a child that blocks (e.g. on stdin) cannot leak a process slot. The server enforces this
  itself rather than relying on `execFile`, which it no longer uses.
- **Subprocess output cap:** a child's combined stdout and stderr is capped at 32 MiB, counted
  in bytes as it arrives; past that the child is `SIGKILL`ed and the streams are detached, so a
  runaway child cannot buffer its output into the server's heap.
- **Subprocess ceiling:** every `beans` invocation acquires one of
  `BEANS_CONCURRENCY` process-wide slots (`apps/server/src/util/concurrency.ts`), so
  concurrent requests queue rather than multiplying child processes. The cap bounds the
  server, not a single request.
- **Event-stream ceiling:** `/api/events` refuses connections past `MAX_SSE_CLIENTS` with
  a `503`, so unbounded streams cannot accumulate sockets and watcher listeners.
- **Request logging:** `/api/*` requests are logged (method, path, status, duration).
  Request and response bodies, headers, and query strings are never logged. The query
  string is stripped before the line is written, because `/api/search?q=…` carries the
  user's search text — the same class of bean content the GraphQL query and variables are
  kept out of logs for. Static asset and SPA serving is not logged.

### Container hardening

The published image runs as the unprivileged `node` user, and the compose stack drops all
capabilities, sets `no-new-privileges`, and mounts the root filesystem read-only with a
tmpfs for `/tmp` and one for `/home/node/.cache` — corepack writes the pinned pnpm version
into that cache on first run, and without it a read-only container fails to boot with
`EROFS`. The project bind mount stays read-write because the UI writes beans; run
the container as the host UID that owns those files (`user:` in `docker-compose.yml`) so
they are not written as root.

The `beans` CLI version baked into the image is pinned in exactly one place: the
`ARG BEANS_VERSION` default in the `Dockerfile`. `docker compose build` inherits it, and
CI reads it from there before `go install`, so the image always ships the binary CI
tested against and a bump is a one-line change.

It previously lived in four places kept in sync by comments alone. That was not
theoretical: a compose build arg silently overrides the `ARG` default, so bumping the
`Dockerfile` on its own shipped the old binary — and this document said to do exactly
that. `pnpm check:pins` now fails the build if a competing literal pin reappears in any
build input.

### No authentication

`beans-web` has no authentication or authorization layer (`apps/server/src/env.ts`). It's a
local-first, single-user tool intended to run on `127.0.0.1`, which is the default `HOST` binding,
though an operator can change `HOST` through the environment. **Setting `HOST` to a non-loopback
address exposes the API to anything that can reach that address, with no access control. That
includes full read AND write of every bean under the configured `GIT_ROOT` roots via GraphQL
queries and mutations.** The cross-origin guard above stops a browser on another site from driving
those mutations, but it is not a substitute for authentication against a direct client. Don't
expose `HOST` outside a trusted, isolated network — put a real auth layer (e.g. an SSO proxy) in
front of it if you must.

The Docker image binds `HOST=0.0.0.0` inside the container by design: a container has its own
network namespace, so binding loopback inside it would put the port somewhere nothing outside
the container can reach, published mapping included. The loopback default is enforced on the
host side instead — `docker-compose.yml` publishes the port as `127.0.0.1:4780:4780` — and
widening that publish carries the same risk as changing `HOST` above.
