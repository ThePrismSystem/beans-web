import { join } from "node:path";
import type { Hono } from "hono";
import type { AppDeps } from "../app.js";
import { assertWithinRoot } from "../discovery/scan.js";
import { BeansError } from "../beans/executor.js";

interface Body {
  query: string;
  variables?: Record<string, unknown>;
}

export function registerGraphql(app: Hono, deps: AppDeps): void {
  app.post("/api/projects/:name/graphql", async (c) => {
    const name = c.req.param("name");
    const project = (await deps.listProjects()).find((p) => p.name === name);
    if (!project) return c.json({ errors: [{ message: `unknown project: ${name}` }] }, 404);
    const configPath = join(assertWithinRoot(deps.root, project.path), ".beans.yml");
    const body = (await c.req.json()) as Body;
    try {
      const data = await deps.runGraphql(configPath, body.query, body.variables);
      return c.json({ data });
    } catch (err) {
      if (err instanceof BeansError)
        return c.json({ errors: err.messages.map((m) => ({ message: m })) }, 400);
      throw err;
    }
  });
}
