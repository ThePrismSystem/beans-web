import { join } from "node:path";

import { bodyLimit } from "hono/body-limit";
import { z } from "zod";

import { BeansError } from "../beans/executor.js";
import { assertWithinRoot } from "../discovery/scan.js";

import type { AppDeps } from "../app.js";
import type { Hono } from "hono";

const bodySchema = z.object({
  query: z.string().min(1),
  variables: z.record(z.string(), z.unknown()).optional(),
});

// GraphQL queries and variables are small; cap the body so an oversized
// payload is rejected before it is buffered and parsed.
const GRAPHQL_MAX_BODY_BYTES = 262_144; // 256 KiB

const HTTP_BAD_REQUEST = 400;
const HTTP_NOT_FOUND = 404;
const HTTP_PAYLOAD_TOO_LARGE = 413;

export function registerGraphql(app: Hono, deps: AppDeps): void {
  app.post(
    "/api/projects/:name/graphql",
    bodyLimit({
      maxSize: GRAPHQL_MAX_BODY_BYTES,
      onError: (c) =>
        c.json({ errors: [{ message: "request body too large" }] }, HTTP_PAYLOAD_TOO_LARGE),
    }),
    async (c) => {
      const name = c.req.param("name");
      const project = (await deps.listProjects()).find((p) => p.name === name);
      if (!project || !deps.roots.includes(project.root)) {
        return c.json({ errors: [{ message: `unknown project: ${name}` }] }, HTTP_NOT_FOUND);
      }

      const parsed = bodySchema.safeParse(await c.req.json().catch(() => null));
      if (!parsed.success) {
        return c.json(
          { errors: [{ message: "invalid request body: expected { query, variables? }" }] },
          HTTP_BAD_REQUEST,
        );
      }

      const configPath = join(assertWithinRoot(project.root, project.path), ".beans.yml");
      try {
        // A client that navigates away while queued for a slot should not still
        // spawn its child when it reaches the front of the queue.
        const data = await deps.runGraphql(
          configPath,
          parsed.data.query,
          parsed.data.variables,
          c.req.raw.signal,
        );
        return c.json({ data });
      } catch (err) {
        if (err instanceof BeansError)
          return c.json({ errors: err.messages.map((m) => ({ message: m })) }, HTTP_BAD_REQUEST);
        throw err;
      }
    },
  );
}
