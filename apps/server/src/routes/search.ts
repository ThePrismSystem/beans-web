import { QueueFullError } from "../util/concurrency.js";

import { clientClosedRequest, QUEUE_FULL_RETRY_AFTER } from "./overload.js";

import type { AppDeps } from "../app.js";
import type { Hono } from "hono";

const HTTP_SERVICE_UNAVAILABLE = 503;

export function registerSearch(app: Hono, deps: AppDeps): void {
  app.get("/api/search", async (c) => {
    try {
      return c.json(await deps.search(c.req.query("q") ?? "", c.req.raw.signal));
    } catch (err) {
      if (err instanceof QueueFullError) {
        return c.text("beans queue is full", HTTP_SERVICE_UNAVAILABLE, QUEUE_FULL_RETRY_AFTER);
      }
      // Only after the specific cases: a genuine bug on a live connection has
      // to keep surfacing as a 500 rather than be flattened into "try again".
      if (c.req.raw.signal.aborted) return clientClosedRequest();
      throw err;
    }
  });
}
