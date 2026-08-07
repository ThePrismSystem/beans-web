# beans-web

[![CI](https://github.com/ThePrismSystem/beans-web/actions/workflows/ci.yml/badge.svg)](https://github.com/ThePrismSystem/beans-web/actions/workflows/ci.yml)
[![codecov](https://codecov.io/gh/ThePrismSystem/beans-web/graph/badge.svg?token=N7I7FNHSIO)](https://codecov.io/gh/ThePrismSystem/beans-web)
[![TypeScript: strict](https://img.shields.io/badge/TypeScript-strict-3178c6?logo=typescript&logoColor=white)](tsconfig.base.json)
[![Node](https://img.shields.io/badge/node-%3E%3D24-339933?logo=node.js&logoColor=white)](.nvmrc)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue)](LICENSE)

A web UI for [`beans`](https://github.com/hmans/beans), the local-first, Markdown-backed issue
tracker. `beans-web` discovers every `beans` project under a configured root directory and
gives each one a browsable overview, hierarchy and flat bean lists, and a detail view with inline
editing and relationship management. It also does cross-project search and simple analytics.
Everything reads and writes your on-disk `.beans` files directly; there is no separate database.

## Screenshots

Every project under your `GIT_ROOT`, with open and total counts broken down by bean type:

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/screenshots/overview-dark.png">
  <img src="docs/screenshots/overview-light.png" alt="The overview, listing five beans projects with their open and total counts broken down by type">
</picture>

Inside a project, beans nest by parent so a milestone shows the epics and bugs underneath it.
Filters and sorting sit above the list, and a flat view is one click away:

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/screenshots/project-dark.png">
  <img src="docs/screenshots/project-light.png" alt="A project view showing a milestone expanded into nested epics, features, tasks and bugs, above filter and sort controls">
</picture>

A bean renders its Markdown body and puts every field inline — type, status, priority and tags
are editable in place, as are its parent and blocking relationships:

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/screenshots/bean-detail-dark.png">
  <img src="docs/screenshots/bean-detail-light.png" alt="A bug's detail view showing its rendered Markdown body, inline-editable fields, its parent epic, and the feature it blocks">
</picture>

It is a pnpm monorepo with two apps and a shared package:

- `apps/server` is a [Hono](https://hono.dev) API server. It discovers `beans` projects, proxies
  GraphQL queries and mutations to the `beans` CLI per project, aggregates cross-project search
  and analytics, streams file-change events over SSE, and serves the built web app in production.
- `apps/web` is a React + [TanStack Router](https://tanstack.com/router)/[Query](https://tanstack.com/query)
  single-page app.
- `packages/shared` holds bean type/status/priority enums, hierarchy rules, and generated GraphQL
  operation strings both apps use.

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for how the pieces fit together, and
[`CONTRIBUTING.md`](CONTRIBUTING.md) for the development workflow.

## Prerequisites

- **Node.js 24+** (see `.nvmrc`)
- **pnpm** (see [pnpm.io/installation](https://pnpm.io/installation); this repo was built against
  pnpm 11)
- The **`beans`** CLI binary on your `PATH`. Install it with:

  ```bash
  go install github.com/hmans/beans@latest
  ```

  and confirm it resolves:

  ```bash
  beans version
  ```

- At least one existing `beans` project (a directory containing a `.beans.yml`, created via
  `beans init`) somewhere under the directory you'll point `GIT_ROOT` at.

## Install

```bash
pnpm install
```

## Configuration

Copy `.env.example` to `.env` (or export the variables directly) and adjust as needed:

| Variable        | Default     | Description                                                                                                                                                                                                                                                                                                                                                                                                            |
| --------------- | ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GIT_ROOT`      | `~/git`     | Comma-separated root directories scanned for `beans` projects (any dir with a `.beans.yml`).                                                                                                                                                                                                                                                                                                                           |
| `SCAN_DEPTH`    | `1`         | Max recursion depth (1–8) when scanning each `GIT_ROOT` entry for projects.                                                                                                                                                                                                                                                                                                                                            |
| `PORT`          | `4780`      | Port the server listens on.                                                                                                                                                                                                                                                                                                                                                                                            |
| `HOST`          | `127.0.0.1` | Bind address. Keep this loopback unless you intend to expose it on a LAN.                                                                                                                                                                                                                                                                                                                                              |
| `BEANS_BIN`     | `beans`     | Path to (or name of) the `beans` binary; defaults to resolving it via `PATH`.                                                                                                                                                                                                                                                                                                                                          |
| `TRUST_PROXY`   | `false`     | Trust `X-Forwarded-Proto`/`X-Forwarded-Host` when checking whether a request is same-origin. Turn this on only when a reverse proxy is the only way in; see [Behind a reverse proxy](#behind-a-reverse-proxy).                                                                                                                                                                                                         |
| `ALLOWED_HOSTS` | _(none)_    | Comma-separated hostnames (no scheme or port) this server accepts requests for, beyond the built-in `localhost`/`127.0.0.1`/`[::1]`. Required the moment you reach the UI by any other hostname or LAN IP — an unrecognized `Host` gets `421`. With `TRUST_PROXY=true`, both the internal host your proxy dials and the public host it forwards must be listed; see [Behind a reverse proxy](#behind-a-reverse-proxy). |

The server never reads or writes outside a project's own configured root. Every resolved project
path is checked against the specific root it was discovered under before use (see
[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md#the-git_root-path-jail)).

## Development

Runs both apps with hot reload, the server via `tsx watch` and the web app via Vite:

```bash
pnpm dev
```

The web dev server proxies API requests to the server (see `apps/web/vite.config.ts`); by default
the server listens on `http://127.0.0.1:4780`.

## Production

Build the web app and start the server, which serves the built SPA and the `/api/*` routes from
one process:

```bash
pnpm start
```

This runs `pnpm --filter @beans-web/web build` followed by
`pnpm --filter @beans-web/server start`. The server runs through `tsx` rather than plain
`node`; see [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md#why-tsx-in-production) for why.

```bash
GIT_ROOT=/path/to/your/git/projects,/path/to/other/projects PORT=4780 pnpm start
```

Then visit `http://127.0.0.1:4780`.

### Docker

The repo ships a production `Dockerfile` (multi-stage: it builds the `beans` CLI
from source too), a `.dockerignore`, and a `docker-compose.yml` that runs as-is
once you point its bind mount at your projects directory:

```bash
docker compose up -d
```

To build the image directly instead:

```bash
docker build -t beans-web:latest .
docker build --build-arg BEANS_VERSION=v0.4.2 -t beans-web:latest .  # pin the CLI
```

#### Container configuration

The image bakes container defaults that differ from the local development
defaults above:

| Variable      | Image default | Notes                                                                                                                                          |
| ------------- | ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `GIT_ROOT`    | `/projects`   | Comma-separated scan root(s) _inside_ the container. Mount each root at a distinct path and list them all, e.g. `/projects,/projects2`.        |
| `SCAN_DEPTH`  | `1`           | Each immediate subdirectory holding a `.beans.yml` is one project.                                                                             |
| `HOST`        | `0.0.0.0`     | Binds all interfaces inside the container. Do not set this to `127.0.0.1`.                                                                     |
| `PORT`        | `4780`        | Container listen port.                                                                                                                         |
| `BEANS_BIN`   | `beans`       | The static binary baked into the image, resolved from `PATH`.                                                                                  |
| `NODE_ENV`    | `production`  |                                                                                                                                                |
| `TRUST_PROXY` | `false`       | Set to `true` when a reverse proxy is the only way in. Required behind TLS termination; see [Behind a reverse proxy](#behind-a-reverse-proxy). |

#### The projects mount

```yaml
volumes:
  - /host/path/to/your/git:/projects # read-write
```

Read-write is required. Editing through the UI writes to your project files, so a
read-only mount leaves the app view-only with every mutation failing.

The container runs as the unprivileged `node` user (uid 1000), so beans written
through the UI already land owned by uid 1000 on the host. If the account that
owns your git projects has a different uid, uncomment `user: "<uid>:<gid>"` in
`docker-compose.yml` and set it to that account (find yours with `id -u`) —
otherwise writes through the UI land with the wrong owner and edits fail with
`EACCES` on the bind mount. Nothing in the container needs privileges beyond
read/write on that mount.

#### Security

This UI reads and writes every beans project under the mount, so anyone who can
reach it can read and edit your issues. Treat it as an internal admin tool: put it
behind authentication before exposing it anywhere, and keep the mount scoped to
the directory holding your beans projects. If the container is compromised, the
attacker has write access to whatever you mounted.

#### Behind a reverse proxy

The container is one HTTP service on port 4780 serving both `/api/*` and the SPA.
Traefik labels for the common case:

```yaml
labels:
  traefik.enable: "true"
  traefik.http.routers.beans.rule: "Host(`beans.example.com`)"
  traefik.http.routers.beans.entrypoints: "websecure"
  traefik.http.routers.beans.tls.certresolver: "letsencrypt"
  traefik.http.services.beans.loadbalancer.server.port: "4780"
  traefik.http.routers.beans.middlewares: "authelia@docker"
```

Set `TRUST_PROXY=true` on any proxied deployment. The app refuses state-changing
requests whose `Origin` doesn't match its own, which is what stops another site
from driving your API. TLS termination breaks that comparison: the browser sends
`Origin: https://beans.example.com`, the proxy forwards plain HTTP, and the server
sees `http://beans.example.com`, so every write comes back `403`. With the flag on
it reads `X-Forwarded-Proto` and `X-Forwarded-Host` instead. If you forget, the
project list still loads because that is a `GET`, but opening a project shows
nothing: the GraphQL reads behind it are `POST`s.

The default is off because a server reachable directly on its port would otherwise
accept forged `X-Forwarded-*` headers, which defeats the guard entirely. Most
proxies send both headers already; Traefik and Caddy do, and a hand-rolled nginx
needs `proxy_set_header X-Forwarded-Proto $scheme;`.

Also set `ALLOWED_HOSTS` to the hostname(s) this server should accept. With
`TRUST_PROXY=true`, the check applies to both the connection's own `Host` header
and the forwarded one — trusting the forwarded value alone would let a forged
`X-Forwarded-Host` bypass the allowlist. Traefik preserves `Host` when forwarding
by default, so for the example above `ALLOWED_HOSTS=beans.example.com` covers
both. If your proxy rewrites `Host` to an internal name before forwarding (a
container or service name, an internal DNS entry), list that too, comma-separated
alongside the public one.

Live updates arrive over an SSE stream at `GET /api/events`. Proxies handle this
by default, but anything that buffers responses or imposes a short read timeout
will break it, so exclude this service (or at least that path) from such
middleware. It runs as a single replica, so sticky sessions are unnecessary.

#### Verifying a container

```bash
docker run -d --name beans-web \
  -p 127.0.0.1:4780:4780 \
  -v /host/path/to/your/git:/projects \
  -e GIT_ROOT=/projects \
  beans-web:latest

curl -s localhost:4780/api/projects | head               # JSON array of your projects
curl -s -o /dev/null -w '%{http_code}\n' localhost:4780/ # 200, the SPA
docker inspect --format '{{.State.Health.Status}}' beans-web
docker rm -f beans-web
```

The image's `HEALTHCHECK` requests the SPA root using Node's `fetch` and reports
healthy a few seconds after start. An empty `/api/projects` means the mount path
or `SCAN_DEPTH` is wrong: check that every `GIT_ROOT` entry points at a directory
whose immediate subfolders contain a `.beans.yml`.

Two things to know about the image. It ships source plus `node_modules` rather
than a compiled bundle, because the server runs through `tsx`, which makes it
larger than a typical Node image. And the shipped `docker-compose.yml` sets
`read_only: true` unconditionally, with tmpfs mounts for both `/tmp` and
`/home/node/.cache` — the latter is where corepack writes the pinned pnpm
version on first run, and the container fails to boot without it.

## Quality checks

```bash
pnpm format                          # prettier --check
pnpm lint                            # eslint, zero warnings
pnpm audit --audit-level moderate    # blocks CI on moderate+ severity vulnerabilities
pnpm typecheck                       # tsc across all packages
pnpm test                            # unit + integration tests (needs `beans` on PATH)
pnpm -r knip                         # unused files/exports/dependencies
pnpm spell                           # cspell
```

End-to-end tests (Playwright) live in `apps/web/e2e`. The harness builds the web app and
starts the production server against a seeded temp root, so a single command runs them:

```bash
pnpm --filter @beans-web/web e2e
```

See [`CONTRIBUTING.md`](CONTRIBUTING.md) for more detail on the development workflow.

## Known limitations

- **Last-write-wins editing.** Optimistic-concurrency (etag/`ifMatch`) guarding is disabled due
  to an upstream `beans` v0.4.2 bug; see
  [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md#known-limitation--optimistic-concurrency).

## License

[MIT](LICENSE) © ThePrismSystem.

This project bundles the [`beans`](https://github.com/hmans/beans) CLI, which is licensed
under Apache-2.0; its license ships inside the Docker image at
`/usr/local/share/licenses/beans/LICENSE`.

See [`CHANGELOG.md`](CHANGELOG.md) for release history.
