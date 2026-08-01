import type { Hono } from "hono";
import type { AppDeps } from "../app.js";

export function registerProjects(app: Hono, deps: AppDeps): void {
  app.get("/api/projects", async (c) => {
    // Project to the wire shape: host filesystem details (`path`, `root`) stay
    // server-side and are never sent to clients.
    const projects = await deps.listProjects();
    return c.json(projects.map(({ name, prefix, counts }) => ({ name, prefix, counts })));
  });
}
