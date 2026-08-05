import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { serve } from "@hono/node-server";

import { buildAnalytics } from "./aggregate/analytics.js";
import { globalSearch } from "./aggregate/search.js";
import { createApp } from "./app.js";
import { runBeansGraphql } from "./beans/executor.js";
import { createProjectCache } from "./discovery/cache.js";
import { discoverProjects } from "./discovery/scan.js";
import { env } from "./env.js";
import { registerStatic } from "./routes/static.js";
import { assertWithinRoot } from "./util/containment.js";
import { BeansWatcher } from "./watch/watcher.js";

// Discovery spawns one `beans` process per project, so serve requests from a
// short-lived cache instead of re-scanning on every /search and /analytics call.
const CACHE_TTL_MS = 5_000;
// Re-scan on this cadence so projects created after boot get watched too.
const REFRESH_INTERVAL_MS = 30_000;

const run = (
  configPath: string,
  beansPath: string,
  root: string,
  query: string,
  variables?: Record<string, unknown>,
  signal?: AbortSignal,
) => runBeansGraphql({ configPath, beansPath, root, query, variables, signal });

const discover = () => discoverProjects(env.GIT_ROOT, env.SCAN_DEPTH);

const { get: listProjects, refresh: refreshProjects } = createProjectCache({
  discover,
  ttlMs: CACHE_TTL_MS,
});

const projects = await listProjects();
const watcher = new BeansWatcher(projects);

const app = createApp({
  roots: env.GIT_ROOT,
  scanDepth: env.SCAN_DEPTH,
  listProjects,
  runGraphql: run,
  search: async (q, signal) => globalSearch(await listProjects(), q, run, signal),
  analytics: async (signal) => buildAnalytics(await listProjects(), run, signal),
  watcher,
  trustProxy: env.TRUST_PROXY,
  allowedHosts: env.ALLOWED_HOSTS,
});

const here = dirname(fileURLToPath(import.meta.url));
if (env.NODE_ENV === "production") registerStatic(app, resolve(here, "../../web/dist"));

// touch assertWithinRoot so the jail is exercised at startup for each project
for (const p of projects) assertWithinRoot(p.root, p.path);

const refresh = setInterval(() => {
  void (async () => {
    try {
      watcher.setProjects(await refreshProjects());
    } catch (err) {
      console.error("project refresh failed:", err);
    }
  })();
}, REFRESH_INTERVAL_MS);
refresh.unref();

const server = serve({ fetch: app.fetch, hostname: env.HOST, port: env.PORT }, (info) => {
  console.info(`beans-frontend server on http://${env.HOST}:${String(info.port)}`);
});

function shutdown(): void {
  clearInterval(refresh);
  void watcher.close();
  server.close(() => process.exit(0));
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
