import type { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import type { ServerEvent } from "@beans-frontend/shared";

import type { AppDeps } from "../app.js";

export function registerEvents(app: Hono, deps: AppDeps): void {
  app.get("/api/events", (c) =>
    streamSSE(c, async (stream) => {
      const handler = (e: ServerEvent) => void stream.writeSSE({ data: JSON.stringify(e) });
      deps.watcher.on("event", handler);
      c.req.raw.signal.addEventListener("abort", () => deps.watcher.off("event", handler));
      while (!c.req.raw.signal.aborted) await stream.sleep(30_000);
    }),
  );
}
