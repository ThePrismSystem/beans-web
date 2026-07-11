import { serve } from "@hono/node-server";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { env } from "./env.js";
import { createApp } from "./app.js";
import { discoverProjects, assertWithinRoot } from "./discovery/scan.js";
import { runBeansGraphql } from "./beans/executor.js";
import { globalSearch } from "./aggregate/search.js";
import { buildAnalytics } from "./aggregate/analytics.js";
import { BeansWatcher } from "./watch/watcher.js";
import { registerStatic } from "./routes/static.js";

const run = (configPath: string, query: string, variables?: Record<string, unknown>) =>
  runBeansGraphql({ configPath, query, variables });

const listProjects = () => discoverProjects(env.GIT_ROOT, env.SCAN_DEPTH);

const projects = await listProjects();
const watcher = new BeansWatcher(projects);

const app = createApp({
  root: env.GIT_ROOT,
  scanDepth: env.SCAN_DEPTH,
  listProjects,
  runGraphql: run,
  search: async (q) => globalSearch(await listProjects(), q, run),
  analytics: async () => buildAnalytics(await listProjects(), run),
  watcher,
});

const here = dirname(fileURLToPath(import.meta.url));
if (env.NODE_ENV === "production") registerStatic(app, resolve(here, "../../web/dist"));

// touch assertWithinRoot so the jail is exercised at startup for each project
for (const p of projects) assertWithinRoot(env.GIT_ROOT, p.path);

serve({ fetch: app.fetch, hostname: env.HOST, port: env.PORT }, (info) =>
  console.log(`beans-frontend server on http://${env.HOST}:${info.port}`),
);
