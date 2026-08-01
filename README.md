# beans-frontend

[![CI](https://github.com/ThePrismSystem/beans-frontend/actions/workflows/ci.yml/badge.svg)](https://github.com/ThePrismSystem/beans-frontend/actions/workflows/ci.yml)
[![codecov](https://codecov.io/gh/ThePrismSystem/beans-frontend/graph/badge.svg?token=N7I7FNHSIO)](https://codecov.io/gh/ThePrismSystem/beans-frontend)
[![TypeScript: strict](https://img.shields.io/badge/TypeScript-strict-3178c6?logo=typescript&logoColor=white)](tsconfig.base.json)
[![Node](https://img.shields.io/badge/node-%3E%3D22-339933?logo=node.js&logoColor=white)](.nvmrc)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue)](LICENSE)

A web UI for [`beans`](https://github.com/hmans/beans), the local-first, Markdown-backed issue
tracker. `beans-frontend` discovers every `beans` project under a configured root directory and
gives each one a browsable overview, hierarchy and flat bean lists, and a detail view with inline
editing and relationship management. It also does cross-project search and simple analytics.
Everything reads and writes your on-disk `.beans` files directly; there is no separate database.

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

- **Node.js 22+** (see `.nvmrc`)
- **pnpm** (see [pnpm.io/installation](https://pnpm.io/installation); this repo was built against
  pnpm 10)
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

| Variable     | Default     | Description                                                                                  |
| ------------ | ----------- | -------------------------------------------------------------------------------------------- |
| `GIT_ROOT`   | `~/git`     | Comma-separated root directories scanned for `beans` projects (any dir with a `.beans.yml`). |
| `SCAN_DEPTH` | `1`         | Max recursion depth (1–8) when scanning each `GIT_ROOT` entry for projects.                  |
| `PORT`       | `4780`      | Port the server listens on.                                                                  |
| `HOST`       | `127.0.0.1` | Bind address. Keep this loopback unless you intend to expose it on a LAN.                    |
| `BEANS_BIN`  | `beans`     | Path to (or name of) the `beans` binary; defaults to resolving it via `PATH`.                |

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

This runs `pnpm --filter @beans-frontend/web build` followed by
`pnpm --filter @beans-frontend/server start`. The server runs through `tsx` rather than plain
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
docker build -t beans-frontend:latest .
docker build --build-arg BEANS_VERSION=v0.4.2 -t beans-frontend:latest .  # pin the CLI
```

#### Container configuration

The image bakes container defaults that differ from the local development
defaults above:

| Variable     | Image default | Notes                                                                                                                                   |
| ------------ | ------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `GIT_ROOT`   | `/projects`   | Comma-separated scan root(s) _inside_ the container. Mount each root at a distinct path and list them all, e.g. `/projects,/projects2`. |
| `SCAN_DEPTH` | `1`           | Each immediate subdirectory holding a `.beans.yml` is one project.                                                                      |
| `HOST`       | `0.0.0.0`     | Binds all interfaces inside the container. Do not set this to `127.0.0.1`.                                                              |
| `PORT`       | `4780`        | Container listen port.                                                                                                                  |
| `BEANS_BIN`  | `beans`       | The static binary baked into the image, resolved from `PATH`.                                                                           |
| `NODE_ENV`   | `production`  |                                                                                                                                         |

#### The projects mount

```yaml
volumes:
  - /host/path/to/your/git:/projects # read-write
```

Read-write is required. Editing through the UI writes to your project files, so a
read-only mount leaves the app view-only with every mutation failing.

The container runs as root by default, which means beans written through the UI
end up root-owned on the host. Set `user: "<uid>:<gid>"` in the Compose service to
the account owning your git projects (commonly `"1000:1000"`) to keep your own
ownership. Nothing in the container needs privileges beyond read/write on that
mount.

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

Live updates arrive over an SSE stream at `GET /api/events`. Proxies handle this
by default, but anything that buffers responses or imposes a short read timeout
will break it, so exclude this service (or at least that path) from such
middleware. It runs as a single replica, so sticky sessions are unnecessary.

#### Verifying a container

```bash
docker run -d --name beans-frontend \
  -p 4780:4780 \
  -v /host/path/to/your/git:/projects \
  -e GIT_ROOT=/projects \
  beans-frontend:latest

curl -s localhost:4780/api/projects | head               # JSON array of your projects
curl -s -o /dev/null -w '%{http_code}\n' localhost:4780/ # 200, the SPA
docker inspect --format '{{.State.Health.Status}}' beans-frontend
docker rm -f beans-frontend
```

The image's `HEALTHCHECK` requests the SPA root using Node's `fetch` and reports
healthy a few seconds after start. An empty `/api/projects` means the mount path
or `SCAN_DEPTH` is wrong: check that every `GIT_ROOT` entry points at a directory
whose immediate subfolders contain a `.beans.yml`.

Two things to know about the image. It ships source plus `node_modules` rather
than a compiled bundle, because the server runs through `tsx`, which makes it
larger than a typical Node image. And if your stack enforces `read_only: true`,
give the container a writable `/tmp` via tmpfs.

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

End-to-end tests (Playwright) live in `apps/web/e2e`:

```bash
pnpm --filter @beans-frontend/web build
pnpm --filter @beans-frontend/web exec playwright test
```

See [`CONTRIBUTING.md`](CONTRIBUTING.md) for more detail on the development workflow.

## Known limitations

- **Last-write-wins editing.** Optimistic-concurrency (etag/`ifMatch`) guarding is disabled due
  to an upstream `beans` v0.4.2 bug; see
  [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md#known-limitation--optimistic-concurrency).

## License

[MIT](LICENSE)
