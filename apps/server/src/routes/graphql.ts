import { join } from "node:path";

import { bodyLimit } from "hono/body-limit";
import { z } from "zod";

import { BeansError } from "../beans/executor.js";
import { QueueFullError } from "../util/concurrency.js";
import { assertWithinRoot, ContainmentError } from "../util/containment.js";

import { clientClosedRequest, QUEUE_FULL_RETRY_AFTER } from "./overload.js";

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
const HTTP_SERVICE_UNAVAILABLE = 503;

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

      const configPath = join(assertWithinRoot(project.root, project.path), ".beans.yml");

      const parsed = bodySchema.safeParse(await c.req.json().catch(() => null));
      if (!parsed.success) {
        return c.json(
          { errors: [{ message: "invalid request body: expected { query, variables? }" }] },
          HTTP_BAD_REQUEST,
        );
      }

      try {
        // A client that navigates away while queued for a slot should not still
        // spawn its child when it reaches the front of the queue.
        const data = await deps.runGraphql(
          configPath,
          project.dataPath,
          project.root,
          parsed.data.query,
          parsed.data.variables,
          c.req.raw.signal,
        );
        return c.json({ data });
      } catch (err) {
        // project.dataPath was resolved and contained once at discovery
        // time, then cached - up to CACHE_TTL_MS/REFRESH_INTERVAL_MS old by
        // the time a request actually arrives. runGraphql re-validates it
        // live, immediately before spawning the beans child (see
        // assertDataPathStillContained in util/containment.ts), which is
        // what surfaces a ContainmentError here if the data directory was
        // swapped for a symlink after discovery validated it. Treated the
        // same as an unknown project, both to keep this route's error
        // surface simple and so a caught swap attempt gets no signal
        // distinguishing it from a plain 404.
        if (err instanceof ContainmentError)
          return c.json({ errors: [{ message: `unknown project: ${name}` }] }, HTTP_NOT_FOUND);
        if (err instanceof BeansError)
          return c.json({ errors: err.messages.map((m) => ({ message: m })) }, HTTP_BAD_REQUEST);
        // This route is behind the same process-wide slot gate as search and
        // analytics, so a saturated queue has to read the same way here.
        if (err instanceof QueueFullError) {
          return c.json(
            { errors: [{ message: "server is busy, retry shortly" }] },
            HTTP_SERVICE_UNAVAILABLE,
            QUEUE_FULL_RETRY_AFTER,
          );
        }
        // Only after the specific cases: a genuine bug on a live connection
        // has to keep surfacing as a 500.
        if (c.req.raw.signal.aborted) return clientClosedRequest();
        throw err;
      }
    },
  );
}
