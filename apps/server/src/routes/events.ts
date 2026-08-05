import { IncomingMessage } from "node:http";

import { streamSSE } from "hono/streaming";

import type { AppDeps } from "../app.js";
import type { ServerEvent } from "@beans-web/shared";
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

/**
 * The node request behind this context, when the node adapter is what served
 * it. `c.env` holds whatever bindings the adapter supplies — `{ incoming,
 * outgoing }` under `@hono/node-server`, and nothing at all when the app is
 * driven straight through `app.fetch`/`app.request` — so its shape is checked
 * rather than assumed. A runtime without it just falls back to the abort
 * signal, which is all this route ever had.
 *
 * Two ways this can start returning `undefined` where it used to return a
 * request, both of which reinstate the leak silently rather than loudly:
 *
 * - **HTTP/2.** `@hono/node-server` serves those as `Http2ServerRequest`,
 *   which is not an `IncomingMessage`. `index.ts` only ever calls `serve()`
 *   over HTTP/1.1, and HTTP/2 has no pipelining, so there is nothing to catch
 *   today — but moving to `createSecureServer` needs this widened.
 * - **A middleware that awaits I/O ahead of this route.** The subscription
 *   below assumes the request cannot already have closed, which holds only
 *   because hono's whole chain runs inside the synchronous prefix of node's
 *   `'request'` event. Insert an `await` upstream and the handler lands in a
 *   later turn, where a socket that died in between leaves `'close'` already
 *   fired, `once` never called, and the stream parked exactly as before.
 */
function nodeRequest(env: unknown): IncomingMessage | undefined {
  const incoming = env instanceof Object && "incoming" in env ? env.incoming : undefined;
  return incoming instanceof IncomingMessage ? incoming : undefined;
}

export function registerEvents(app: Hono, deps: AppDeps): void {
  let openStreams = 0;

  app.get("/api/events", (c) => {
    if (openStreams >= MAX_SSE_CLIENTS) {
      return c.text("too many event streams", HTTP_SERVICE_UNAVAILABLE);
    }

    return streamSSE(c, async (stream) => {
      // The while loop below only re-checks for a disconnect after its
      // current heartbeat sleep resolves, so it can lag up to HEARTBEAT_MS
      // behind an actual one. Release the slot from the disconnect event
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

        // `c.req.raw.signal` on its own does not notice every disconnect.
        // node emits 'request' for a request pipelined behind an unfinished
        // response, but queues its ServerResponse rather than attaching it to
        // the socket — and @hono/node-server aborts the signal only from that
        // response's 'close', which an unattached response never emits. Such a
        // stream would hold its listener and its slot for the life of the
        // process: no heartbeat dislodges it, because hono's writes to a dead
        // stream resolve rather than reject. The IncomingMessage does close,
        // since node destroys every request still queued on a socket when the
        // socket goes, so fold that in as a second way for the same stream to
        // end. Whichever arrives first wins; `abort()` makes the other a no-op.
        const disconnected = new AbortController();
        const disconnect = (): void => {
          disconnected.abort();
        };
        c.req.raw.signal.addEventListener("abort", disconnect, { once: true });
        nodeRequest(c.env)?.once("close", disconnect);

        const handler = (e: ServerEvent) => {
          // Drop the listener if the client has gone away mid-write rather than
          // silently discarding the rejected write and leaking the subscription.
          stream.writeSSE({ data: JSON.stringify(e) }).catch(() => {
            deps.watcher.off("event", handler);
          });
        };
        deps.watcher.on("event", handler);
        disconnected.signal.addEventListener(
          "abort",
          () => {
            deps.watcher.off("event", handler);
            release();
          },
          { once: true },
        );
        while (!isAborted(disconnected.signal)) {
          await sleepUntilAborted(disconnected.signal, HEARTBEAT_MS);
          if (isAborted(disconnected.signal)) break;
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
