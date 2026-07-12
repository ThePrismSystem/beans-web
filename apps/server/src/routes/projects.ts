import type { Hono } from "hono";
import type { AppDeps } from "../app.js";

export function registerProjects(app: Hono, deps: AppDeps): void {
  app.get("/api/projects", async (c) => c.json(await deps.listProjects()));
}
