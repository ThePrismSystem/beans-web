import { Hono } from "hono";
import type { Analytics, Project } from "@beans-frontend/shared";

import type { SearchHit } from "./aggregate/search.js";
import { registerAnalytics } from "./routes/analytics.js";
import { registerGraphql } from "./routes/graphql.js";
import { registerProjects } from "./routes/projects.js";
import { registerSearch } from "./routes/search.js";

export interface AppDeps {
  root: string;
  scanDepth: number;
  listProjects(): Promise<Project[]>;
  runGraphql(
    configPath: string,
    query: string,
    variables?: Record<string, unknown>,
  ): Promise<unknown>;
  search(q: string): Promise<SearchHit[]>;
  analytics(): Promise<Analytics>;
}

export function createApp(deps: AppDeps): Hono {
  const app = new Hono();
  registerProjects(app, deps);
  registerGraphql(app, deps);
  registerSearch(app, deps);
  registerAnalytics(app, deps);
  return app;
}
