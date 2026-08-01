import { join } from "node:path";
import type { Hono } from "hono";
import { z } from "zod";
import type { AppDeps } from "../app.js";
import { assertWithinRoot } from "../discovery/scan.js";
import { BeansError } from "../beans/executor.js";

const bodySchema = z.object({
  query: z.string().min(1),
  variables: z.record(z.string(), z.unknown()).optional(),
});

export function registerGraphql(app: Hono, deps: AppDeps): void {
  app.post("/api/projects/:name/graphql", async (c) => {
    const name = c.req.param("name");
    const project = (await deps.listProjects()).find((p) => p.name === name);
    if (!project) return c.json({ errors: [{ message: `unknown project: ${name}` }] }, 404);

    const parsed = bodySchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) {
      return c.json(
        { errors: [{ message: "invalid request body: expected { query, variables? }" }] },
        400,
      );
    }

    const configPath = join(assertWithinRoot(project.root, project.path), ".beans.yml");
    try {
      const data = await deps.runGraphql(configPath, parsed.data.query, parsed.data.variables);
      return c.json({ data });
    } catch (err) {
      if (err instanceof BeansError)
        return c.json({ errors: err.messages.map((m) => ({ message: m })) }, 400);
      throw err;
    }
  });
}
