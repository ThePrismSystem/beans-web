import { Hono } from "hono";
import type { Project } from "@beans-frontend/shared";
import { registerProjects } from "./routes/projects.js";
import { registerGraphql } from "./routes/graphql.js";

export interface AppDeps {
  root: string;
  scanDepth: number;
  listProjects(): Promise<Project[]>;
  runGraphql(
    configPath: string,
    query: string,
    variables?: Record<string, unknown>,
  ): Promise<unknown>;
}

export function createApp(deps: AppDeps): Hono {
  const app = new Hono();
  registerProjects(app, deps);
  registerGraphql(app, deps);
  return app;
}
