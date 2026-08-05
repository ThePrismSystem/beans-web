import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { serve } from "@hono/node-server";

import { buildAnalytics } from "./aggregate/analytics.js";
import { globalSearch } from "./aggregate/search.js";
import { createApp } from "./app.js";
import { runBeansGraphql } from "./beans/executor.js";
import { discoverProjects, assertWithinRoot } from "./discovery/scan.js";
import { env } from "./env.js";
import { registerStatic } from "./routes/static.js";
import { BeansWatcher } from "./watch/watcher.js";

import type { ProjectRecord } from "./discovery/scan.js";

// Discovery spawns one `beans` process per project, so serve requests from a
// short-lived cache instead of re-scanning on every /search and /analytics call.
const CACHE_TTL_MS = 5_000;
// Re-scan on this cadence so projects created after boot get watched too.
const REFRESH_INTERVAL_MS = 30_000;

const run = (
  configPath: string,
  beansPath: string,
  query: string,
  variables?: Record<string, unknown>,
  signal?: AbortSignal,
) => runBeansGraphql({ configPath, beansPath, query, variables, signal });

const discover = () => discoverProjects(env.GIT_ROOT, env.SCAN_DEPTH);

let cache: { at: number; projects: ProjectRecord[] } | null = null;
// A discovery pass fans out one `beans` child per project. Without this, every
// request arriving on a cold or just-expired cache starts its own pass, so K
// concurrent requests queue K x N children for the same answer. Callers share
// the in-flight promise instead and the stampede collapses to one pass.
let inFlight: Promise<ProjectRecord[]> | null = null;
const listProjects = async (): Promise<ProjectRecord[]> => {
  const now = Date.now();
  if (cache && now - cache.at < CACHE_TTL_MS) return cache.projects;
  inFlight ??= discover()
    .then((projects) => {
      cache = { at: Date.now(), projects };
      return projects;
    })
    .finally(() => {
      inFlight = null;
    });
  return inFlight;
};

const projects = await listProjects();
const watcher = new BeansWatcher(projects);

const app = createApp({
  roots: env.GIT_ROOT,
  scanDepth: env.SCAN_DEPTH,
  listProjects,
  runGraphql: run,
  search: async (q) => globalSearch(await listProjects(), q, run),
  analytics: async () => buildAnalytics(await listProjects(), run),
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
      const next = await discover();
      cache = { at: Date.now(), projects: next };
      watcher.setProjects(next);
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
