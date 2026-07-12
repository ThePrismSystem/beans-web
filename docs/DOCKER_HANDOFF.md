# beans-frontend — Docker / Compose handoff

Everything you need to add `beans-frontend` to an existing Docker Compose +
Traefik stack. The container image and a reference compose service already
exist in this repo and have been build- and run-tested (a container built from
this `Dockerfile` discovers real projects from a mounted directory and serves
the SPA + API).

## What this app is (and its unusual runtime needs)

A web UI over the [`beans`](https://github.com/hmans/beans) CLI — a local-first,
Markdown-backed issue tracker with **no database**. Three things shape the
deployment:

1. **It shells out to the `beans` Go binary** (one process per project). The
   image builds a static `beans` binary in a Go stage and puts it on `PATH`, so
   you don't need to install anything separately.
2. **State lives on disk under `GIT_ROOT`.** The app reads *and writes* the
   `.beans` files (creating, editing, scrapping beans). The projects directory
   must be bind-mounted **read-write**.
3. **The server runs its TypeScript via `tsx`.** The image therefore ships the
   source + `node_modules` (not a compiled bundle). This makes the image larger
   than a typical Node service; that's expected.

## Files in this repo

| File | Purpose |
|------|---------|
| `Dockerfile` | Multi-stage build: (1) `go install github.com/hmans/beans` → static binary, (2) `pnpm install` + build the web SPA, (3) slim Node runtime that serves API + SPA. |
| `.dockerignore` | Keeps `node_modules`, `dist`, `.git`, `.env`, etc. out of the build context. |
| `docker-compose.example.yml` | A working reference service to copy into your stack. |

## Build

```bash
docker build -t beans-frontend:latest .
# Pin the beans CLI version (optional; requires Go >= 1.24.6 in the builder,
# which the golang:1.24 base provides):
docker build --build-arg BEANS_VERSION=v0.4.2 -t beans-frontend:latest .
```

## Configuration (environment)

All are baked with sensible container defaults in the `Dockerfile`; override in
compose as needed.

| Var | Default (image) | Notes |
|-----|-----------------|-------|
| `GIT_ROOT` | `/projects` | Scan root **inside** the container. Point your bind mount here. |
| `SCAN_DEPTH` | `1` | Each immediate subdirectory of `GIT_ROOT` containing a `.beans.yml` is one project. Increase only if your projects are nested deeper. |
| `HOST` | `0.0.0.0` | Must bind all interfaces inside the container (do **not** set to `127.0.0.1`). |
| `PORT` | `4780` | Container listen port; this is the Traefik service port. |
| `BEANS_BIN` | `beans` | Resolved from `PATH`; the baked-in static binary. |
| `NODE_ENV` | `production` | — |

## The one required mount

```yaml
volumes:
  - /host/path/to/your/git:/projects   # READ-WRITE
```

- **Read-write is mandatory** — editing through the UI writes to your project
  files. A read-only mount makes the app view-only and mutations will fail.
- **File ownership:** by default the container runs as root, so beans written
  through the UI would be root-owned on the host. Set `user: "<uid>:<gid>"` in
  the compose service to the account that owns your git projects (e.g.
  `"1000:1000"`) so edits keep your ownership. The `beans` binary and Node only
  need read/write on the mount, nothing privileged.

## Traefik

The app is a single HTTP service on port **4780** serving both the API
(`/api/*`) and the SPA (everything else, with SPA fallback). Standard labels:

```yaml
labels:
  traefik.enable: "true"
  traefik.http.routers.beans.rule: "Host(`beans.your-domain`)"
  traefik.http.routers.beans.entrypoints: "websecure"
  traefik.http.routers.beans.tls.certresolver: "<your-resolver>"
  traefik.http.services.beans.loadbalancer.server.port: "4780"
  traefik.http.routers.beans.middlewares: "authelia@docker"   # see Security
```

Attach the service to your Traefik network (e.g. `networks: [traefik]` with the
external Traefik network) and drop the `expose`/`ports` accordingly.

### Server-Sent Events

Live updates use an SSE stream at **`GET /api/events`** (file-change events via
a filesystem watcher). Traefik proxies SSE fine out of the box; just make sure
nothing in front of it **buffers responses or imposes a short read timeout** on
that path. If you have a global response-buffering middleware, exclude this
service (or at least `/api/events`) from it. No sticky sessions or special
routing are needed — it's a single replica.

## Security (please read)

This UI **exposes and mutates** the contents of every beans project under the
mount — anyone who can reach it can read and edit your issues. Treat it like an
internal admin tool:

- **Put it behind authentication.** Your stack already runs Authelia; add the
  forward-auth middleware to the router (`authelia@docker` above). Do **not**
  expose it unauthenticated on a public entrypoint.
- The read-write project mount means a compromise of the container can modify
  files in your repos. Keep the mount scoped to just your beans/git projects
  directory, and consider running the container as a non-root, project-owning
  UID (above).

## Healthcheck

The image defines a `HEALTHCHECK` that requests the SPA root with Node's
`fetch` (no `beans` processes spawned). It reports `healthy` a few seconds after
start; Compose/Traefik can gate on it. Override interval/timeout in compose if
your orchestrator prefers.

## Quick verification (standalone, before wiring Traefik)

```bash
docker build -t beans-frontend:latest .
docker run -d --name beans-frontend \
  -p 4780:4780 \
  -v /host/path/to/your/git:/projects \
  -e GIT_ROOT=/projects \
  beans-frontend:latest

curl -s localhost:4780/api/projects | head    # -> JSON array of your projects
curl -s -o /dev/null -w '%{http_code}\n' localhost:4780/   # -> 200 (SPA)
docker inspect --format '{{.State.Health.Status}}' beans-frontend   # -> healthy
docker rm -f beans-frontend
```

If `/api/projects` returns `[]`, the mount path or `SCAN_DEPTH` is off: confirm
`GIT_ROOT` points at the directory whose immediate subfolders contain
`.beans.yml`.

## Notes / gotchas

- **Image size:** the runtime keeps source + `node_modules` (for `tsx`). Fine
  for a homelab; a future compiled-bundle build could slim it, but that needs
  resolving the raw-TS shared-package import first — out of scope here.
- **`beans` version:** `BEANS_VERSION=latest` tracks upstream; pin it for
  reproducible builds. The builder base is `golang:1.24` because beans ≥ v0.4.2
  requires Go ≥ 1.24.6.
- **Read-only root FS:** if your stack enforces `read_only: true`, give the
  container a writable `/tmp` (`tmpfs`) — Node/tsx may need it — and remember
  the `/projects` mount stays writable.
