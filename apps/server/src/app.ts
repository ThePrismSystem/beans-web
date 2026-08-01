import { EventEmitter } from "node:events";
import { Hono } from "hono";
import type { Analytics, SearchResult } from "@beans-frontend/shared";

import type { ProjectRecord } from "./discovery/scan.js";
import { registerAnalytics } from "./routes/analytics.js";
import { registerEvents } from "./routes/events.js";
import { registerGraphql } from "./routes/graphql.js";
import { registerProjects } from "./routes/projects.js";
import { registerSearch } from "./routes/search.js";

export interface AppDeps {
  roots: string[];
  scanDepth: number;
  listProjects(): Promise<ProjectRecord[]>;
  runGraphql(
    configPath: string,
    query: string,
    variables?: Record<string, unknown>,
  ): Promise<unknown>;
  search(q: string): Promise<SearchResult>;
  analytics(): Promise<Analytics>;
  watcher: EventEmitter;
}

export function createApp(deps: AppDeps): Hono {
  const app = new Hono();
  registerProjects(app, deps);
  registerGraphql(app, deps);
  registerSearch(app, deps);
  registerAnalytics(app, deps);
  registerEvents(app, deps);
  return app;
}
