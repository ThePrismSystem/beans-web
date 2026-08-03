# syntax=docker/dockerfile:1
#
# beans-frontend production image.
#
# Runtime dependencies that make this app unusual:
#   * It shells out to the `beans` Go CLI (github.com/hmans/beans) per project,
#     so the binary must be on PATH inside the container (stage 1 builds it).
#   * It has no database: it reads/writes the on-disk `.beans` files under
#     GIT_ROOT (a comma-separated list of one or more paths), each of which
#     must be bind-mounted read-write at runtime.
#   * The server runs its TypeScript source directly via `tsx` (the shared
#     package is consumed as raw TS), so the runtime image keeps the source +
#     node_modules rather than a compiled JS bundle.

# ---------------------------------------------------------------------------
# Stage 1 — build the `beans` CLI. CGO is disabled so the result is a static
# binary that runs on any glibc/musl base without extra shared libraries.
# ---------------------------------------------------------------------------
FROM golang:1.24-bookworm AS beans-builder
# Keep in sync with the pin in .github/workflows/ci.yml — the image must ship
# the binary CI tested against.
ARG BEANS_VERSION=v0.4.2
ENV CGO_ENABLED=0
RUN go install "github.com/hmans/beans@${BEANS_VERSION}"
# -> /go/bin/beans
# Keep the upstream Apache-2.0 license so the redistributed binary ships with
# its attribution (the module cache dir name embeds the resolved version).
RUN cp "$(go env GOMODCACHE)"/github.com/hmans/beans@*/LICENSE /beans-LICENSE

# ---------------------------------------------------------------------------
# Stage 2 — install workspace deps and build the web SPA.
# ---------------------------------------------------------------------------
FROM node:22-bookworm-slim AS app-builder
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH
RUN corepack enable
WORKDIR /app

# Install with only the manifests first so the dependency layer caches well.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/shared/package.json packages/shared/package.json
COPY apps/server/package.json apps/server/package.json
COPY apps/web/package.json apps/web/package.json
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile

# Bring in the sources and build the web bundle (apps/web/dist).
COPY . .
RUN pnpm --filter @beans-frontend/web build

# ---------------------------------------------------------------------------
# Stage 3 — runtime. Debian (glibc) base to match the Node ecosystem; the
# beans binary is static so it runs here regardless.
# ---------------------------------------------------------------------------
FROM node:22-bookworm-slim AS runtime
RUN corepack enable
WORKDIR /app

# The beans CLI, plus its Apache-2.0 license for redistribution attribution.
COPY --from=beans-builder /go/bin/beans /usr/local/bin/beans
COPY --from=beans-builder /beans-LICENSE /usr/local/share/licenses/beans/LICENSE

# The app: source + node_modules (incl. tsx) + built web dist.
COPY --from=app-builder /app ./

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=4780 \
    GIT_ROOT=/projects \
    SCAN_DEPTH=1 \
    BEANS_BIN=beans \
    TRUST_PROXY=false

# GIT_ROOT is a bind mount supplied by the compose stack. Add more mounts and
# extend GIT_ROOT's comma-separated value to scan more than one root.
VOLUME ["/projects"]
EXPOSE 4780

# Lightweight liveness probe: hit the SPA root (does not spawn beans processes).
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||4780)+'/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["pnpm", "--filter", "@beans-frontend/server", "start"]
