import type { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import type { ServerEvent } from "@beans-frontend/shared";

import type { AppDeps } from "../app.js";

// Send a comment-only heartbeat this often so idle proxies don't drop the
// stream. Long enough that it never interleaves with a request/response in tests.
const HEARTBEAT_MS = 25_000;

export function registerEvents(app: Hono, deps: AppDeps): void {
  app.get("/api/events", (c) =>
    streamSSE(c, async (stream) => {
      const handler = (e: ServerEvent) => {
        // Drop the listener if the client has gone away mid-write rather than
        // silently discarding the rejected write and leaking the subscription.
        stream.writeSSE({ data: JSON.stringify(e) }).catch(() => {
          deps.watcher.off("event", handler);
        });
      };
      deps.watcher.on("event", handler);
      c.req.raw.signal.addEventListener("abort", () => deps.watcher.off("event", handler));
      while (!c.req.raw.signal.aborted) {
        await stream.sleep(HEARTBEAT_MS);
        if (c.req.raw.signal.aborted) break;
        // A named "ping" event keeps the connection warm without reaching the
        // client's default `onmessage` handler.
        await stream.writeSSE({ event: "ping", data: "" }).catch(() => {
          deps.watcher.off("event", handler);
        });
      }
    }),
  );
}
