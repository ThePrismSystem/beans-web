import { streamSSE } from "hono/streaming";

import type { AppDeps } from "../app.js";
import type { ServerEvent } from "@beans-frontend/shared";
import type { Hono } from "hono";

// Send a comment-only heartbeat this often so idle proxies don't drop the
// stream. Long enough that it never interleaves with a request/response in tests.
const HEARTBEAT_MS = 25_000;

const HTTP_SERVICE_UNAVAILABLE = 503;

/**
 * Ceiling on simultaneous event streams. Each one holds a socket and a watcher
 * listener for as long as it is open, and the route is a GET, so it is exempt
 * from the cross-origin guard. A browser caps ~6 connections per origin, so
 * this leaves room for several tabs while bounding a direct client.
 */
export const MAX_SSE_CLIENTS = 32;

// TS narrows a repeated `signal.aborted` read across an `await` to the
// literal it held before the wait, even though an abort can land during that
// wait. Route the re-check through a plain function so it gets the real
// `boolean` type instead of a stale narrowing.
function isAborted(signal: AbortSignal): boolean {
  return signal.aborted;
}

/**
 * Waits out the heartbeat interval, but gives up as soon as the client goes
 * away. `stream.sleep` is a bare `setTimeout`, so on its own it keeps the
 * callback — and the timer and TransformStream it closes over — alive for the
 * full interval after a disconnect. Connect/abort churn would then pile up
 * dead closures at connection rate, unbounded by `MAX_SSE_CLIENTS`, since the
 * slot is released on abort rather than when the callback finally unwinds.
 *
 * Must not be called with an already-aborted signal: a listener registered
 * after `abort` has fired never runs, so the sleep would serve its full term.
 * The loop below checks first, with no await in between.
 */
function sleepUntilAborted(signal: AbortSignal, ms: number): Promise<void> {
  return new Promise<void>((resolve) => {
    const done = (): void => {
      clearTimeout(timer);
      signal.removeEventListener("abort", done);
      resolve();
    };
    const timer = setTimeout(done, ms);
    signal.addEventListener("abort", done, { once: true });
  });
}

export function registerEvents(app: Hono, deps: AppDeps): void {
  let openStreams = 0;

  app.get("/api/events", (c) => {
    if (openStreams >= MAX_SSE_CLIENTS) {
      return c.text("too many event streams", HTTP_SERVICE_UNAVAILABLE);
    }

    return streamSSE(c, async (stream) => {
      // The while loop below only re-checks the abort signal after its
      // current heartbeat sleep resolves, so it can lag up to HEARTBEAT_MS
      // behind an actual disconnect. Release the slot from the abort event
      // itself so a torn-down connection frees capacity immediately; `release`
      // is idempotent so the `finally` below can't double-decrement.
      let released = false;
      const release = () => {
        if (released) return;
        released = true;
        openStreams -= 1;
      };

      try {
        // hono's streamSSE invokes this callback synchronously (no await
        // between the cap check above and here), so this stays atomic with
        // it. If streamSSE ever threw before reaching this callback, the slot
        // would never be claimed — better than a leak that never gets
        // released.
        openStreams += 1;

        const handler = (e: ServerEvent) => {
          // Drop the listener if the client has gone away mid-write rather than
          // silently discarding the rejected write and leaking the subscription.
          stream.writeSSE({ data: JSON.stringify(e) }).catch(() => {
            deps.watcher.off("event", handler);
          });
        };
        deps.watcher.on("event", handler);
        c.req.raw.signal.addEventListener("abort", () => {
          deps.watcher.off("event", handler);
          release();
        });
        while (!isAborted(c.req.raw.signal)) {
          await sleepUntilAborted(c.req.raw.signal, HEARTBEAT_MS);
          if (isAborted(c.req.raw.signal)) break;
          // A named "ping" event keeps the connection warm without reaching the
          // client's default `onmessage` handler.
          await stream.writeSSE({ event: "ping", data: "" }).catch(() => {
            deps.watcher.off("event", handler);
          });
        }
      } finally {
        release();
      }
    });
  });
}
