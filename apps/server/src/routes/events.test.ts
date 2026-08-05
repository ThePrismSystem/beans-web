import { EventEmitter } from "node:events";
import net from "node:net";

import { serve } from "@hono/node-server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createApp } from "../app.js";
import { fakeAnalytics, fakeProject } from "../testing/fixtures.js";

import { MAX_SSE_CLIENTS } from "./events.js";

import type { AppDeps } from "../app.js";
import type { ServerType } from "@hono/node-server";
import type { Hono } from "hono";

// hono's StreamingApi.write() swallows every error internally (bare
// `try { await this.writer.write(...) } catch {}`, never rethrown), so
// writeSSE() can never actually reject through any client-observable action
// (aborting, cancelling the reader, etc.) — the events.ts write-failure
// cleanup path is unreachable through the real stream. To exercise it, stub
// streamSSE for one test with a real SSEStreamingApi instance whose writeSSE
// is overridden to reject, which runs events.ts's own catch handler for real.
let failNextWrite = false;

/**
 * Stream callbacks that have been entered but have not yet returned.
 *
 * Releasing the watcher listener and the MAX_SSE_CLIENTS slot is not on its
 * own enough for a dead connection: the callback has to unwind too. One that
 * merely gives its slot back while staying parked on `sleepUntilAborted` keeps
 * a 25s timer, a TransformStream and every closure around it alive forever,
 * and writes a ping into the dead stream on every interval — and because the
 * slot is already back, the cap no longer bounds how many of those can pile
 * up. That is worse than the leak it replaces, and it is invisible to a test
 * that only counts listeners and slots. Wrapping the callback is the direct
 * observation of "it returned"; nothing else in this file can see it.
 */
let liveCallbacks = 0;

vi.mock("hono/streaming", async (importOriginal) => {
  const actual = await importOriginal<typeof import("hono/streaming")>();
  const track = (cb: Parameters<typeof actual.streamSSE>[1]) => {
    return async (stream: Parameters<typeof cb>[0]): Promise<void> => {
      liveCallbacks += 1;
      try {
        await cb(stream);
      } finally {
        liveCallbacks -= 1;
      }
    };
  };
  return {
    ...actual,
    streamSSE: (
      c: Parameters<typeof actual.streamSSE>[0],
      cb: Parameters<typeof actual.streamSSE>[1],
      onError?: Parameters<typeof actual.streamSSE>[2],
    ) => {
      if (!failNextWrite) return actual.streamSSE(c, track(cb), onError);
      const { readable, writable } = new TransformStream();
      const stream = new actual.SSEStreamingApi(writable, readable);
      stream.writeSSE = () => Promise.reject(new Error("write failed"));
      void track(cb)(stream);
      return c.body(null);
    },
  };
});

const project = fakeProject("proj-a");

function deps(watcher: EventEmitter, overrides: Partial<AppDeps> = {}): AppDeps {
  return {
    roots: ["/root"],
    scanDepth: 4,
    listProjects: vi.fn(() => Promise.resolve([project])),
    runGraphql: vi.fn(() => Promise.resolve({})),
    search: vi.fn(() => Promise.resolve({ hits: [], failures: [] })),
    analytics: vi.fn(() => Promise.resolve(fakeAnalytics())),
    watcher,
    trustProxy: false,
    allowedHosts: [],
    ...overrides,
  };
}

const LOOPBACK = "127.0.0.1";

/**
 * Boots the app on the real node adapter. `app.request()` dispatches straight
 * into hono and never produces the adapter's bindings or a real socket, and
 * the disconnect these tests cover is defined entirely by which node events a
 * `ServerResponse` does and does not emit — so it is only visible over a
 * genuine connection. Port 0 so concurrent runs can't collide.
 */
function listen(app: Hono): Promise<{ server: ServerType; port: number }> {
  return new Promise((resolve) => {
    const server = serve({ fetch: app.fetch, port: 0, hostname: LOOPBACK }, (info) => {
      resolve({ server, port: info.port });
    });
  });
}

/**
 * Two pipelined `GET /api/events` on one socket, then a hard destroy. Node
 * emits `'request'` for the second one but queues its `ServerResponse` behind
 * the first instead of attaching it to the socket, which is the state the
 * route has to survive.
 */
function pipelineThenDestroy(port: number): Promise<void> {
  const request = `GET /api/events HTTP/1.1\r\nHost: ${LOOPBACK}:${String(port)}\r\n\r\n`;
  return new Promise((resolve) => {
    const socket = net.connect(port, LOOPBACK, () => {
      socket.write(request + request);
      // Give the server a turn to accept both before the connection dies;
      // resolving on the write would race the second 'request' event.
      setTimeout(() => {
        socket.destroy();
        resolve();
      }, 100);
    });
  });
}

function openStream(port: number, signal: AbortSignal): Promise<number> {
  return fetch(`http://${LOOPBACK}:${String(port)}/api/events`, { signal }).then(
    (res) => res.status,
  );
}

describe("GET /api/events", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("streams a ServerEvent emitted on the watcher as an SSE chunk", async () => {
    vi.useFakeTimers();
    const watcher = new EventEmitter();
    const app = createApp(deps(watcher));
    const controller = new AbortController();

    const res = await app.request("/api/events", { signal: controller.signal });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/event-stream");

    const reader = res.body?.getReader();
    if (!reader) throw new Error("expected a readable body");

    watcher.emit("event", { project: "proj-a", kind: "change" });
    const { value, done } = await reader.read();

    expect(done).toBe(false);
    const chunk = new TextDecoder().decode(value);
    expect(chunk).toBe('data: {"project":"proj-a","kind":"change"}\n\n');

    controller.abort();
    await reader.cancel();
    expect(watcher.listenerCount("event")).toBe(0);
  });

  it("drops the watcher listener when a write fails mid-stream", async () => {
    vi.useFakeTimers();
    failNextWrite = true;
    try {
      const watcher = new EventEmitter();
      const app = createApp(deps(watcher));

      await app.request("/api/events");
      watcher.emit("event", { project: "proj-a", kind: "change" });

      await vi.waitFor(() => {
        expect(watcher.listenerCount("event")).toBe(0);
      });
    } finally {
      failNextWrite = false;
    }
  });

  it("sends a heartbeat ping and keeps the connection open", async () => {
    vi.useFakeTimers();
    const watcher = new EventEmitter();
    const app = createApp(deps(watcher));
    const controller = new AbortController();

    const res = await app.request("/api/events", { signal: controller.signal });
    const reader = res.body?.getReader();
    if (!reader) throw new Error("expected a readable body");

    await vi.advanceTimersByTimeAsync(25_000);
    const { value, done } = await reader.read();

    expect(done).toBe(false);
    const chunk = new TextDecoder().decode(value);
    expect(chunk).toBe("event: ping\ndata: \n\n");

    controller.abort();
    await reader.cancel();
  });

  it("rejects a connection past MAX_SSE_CLIENTS with 503", async () => {
    vi.useFakeTimers();
    const watcher = new EventEmitter();
    const app = createApp(deps(watcher));
    const controllers: AbortController[] = [];

    for (let i = 0; i < MAX_SSE_CLIENTS; i++) {
      const controller = new AbortController();
      controllers.push(controller);
      const res = await app.request("/api/events", { signal: controller.signal });
      expect(res.status).toBe(200);
    }

    const overflow = await app.request("/api/events");
    expect(overflow.status).toBe(503);

    controllers.forEach((controller) => {
      controller.abort();
    });
  });

  it("frees a slot when a stream closes", async () => {
    vi.useFakeTimers();
    const watcher = new EventEmitter();
    const app = createApp(deps(watcher));
    const controllers: AbortController[] = [];

    for (let i = 0; i < MAX_SSE_CLIENTS; i++) {
      const controller = new AbortController();
      controllers.push(controller);
      await app.request("/api/events", { signal: controller.signal });
    }
    expect((await app.request("/api/events")).status).toBe(503);

    const [firstController] = controllers;
    expect(firstController).toBeDefined();
    firstController?.abort();
    await vi.waitFor(async () => {
      expect((await app.request("/api/events")).status).toBe(200);
    });

    controllers.forEach((controller) => {
      controller.abort();
    });
  });

  it("releases a slot exactly once when an aborted stream's heartbeat sleep later resolves", async () => {
    vi.useFakeTimers();
    const watcher = new EventEmitter();
    const app = createApp(deps(watcher));
    const controller = new AbortController();

    await app.request("/api/events", { signal: controller.signal });
    controller.abort();

    // The abort listener already released this stream's slot. Let its
    // pending heartbeat sleep resolve too, so the while loop notices the
    // abort, breaks, and its `finally` calls release() a second time —
    // exercising the double-release guard, not just the abort listener.
    await vi.advanceTimersByTimeAsync(25_000);

    // If release() were not idempotent, this stream's teardown would have
    // decremented openStreams twice, letting MAX_SSE_CLIENTS + 1 connections
    // through instead of MAX_SSE_CLIENTS.
    const controllers: AbortController[] = [];
    for (let i = 0; i < MAX_SSE_CLIENTS; i++) {
      const c = new AbortController();
      controllers.push(c);
      const res = await app.request("/api/events", { signal: c.signal });
      expect(res.status).toBe(200);
    }
    const overflow = await app.request("/api/events");
    expect(overflow.status).toBe(503);

    controllers.forEach((c) => {
      c.abort();
    });
  });

  it("clears the heartbeat timer on abort instead of holding it for the interval", async () => {
    vi.useFakeTimers();
    const watcher = new EventEmitter();
    const app = createApp(deps(watcher));
    const controller = new AbortController();

    await app.request("/api/events", { signal: controller.signal });
    // The stream is parked on its heartbeat sleep, so a timer is pending.
    await vi.waitFor(() => {
      expect(vi.getTimerCount()).toBeGreaterThan(0);
    });

    controller.abort();
    // Yield so the abort listener and the unwinding callback both run.
    await Promise.resolve();
    await Promise.resolve();

    // Without an abort-aware sleep the timer — and the callback, TransformStream
    // and closures it keeps alive — would survive for the full interval, so
    // connect/abort churn piled up dead streams that MAX_SSE_CLIENTS did not
    // bound. Advancing time here would mask that; the point is it is gone now.
    expect(vi.getTimerCount()).toBe(0);
  });

  it("drops the watcher listener when the heartbeat ping write fails", async () => {
    vi.useFakeTimers();
    failNextWrite = true;
    try {
      const watcher = new EventEmitter();
      const app = createApp(deps(watcher));
      const controller = new AbortController();

      await app.request("/api/events", { signal: controller.signal });
      expect(watcher.listenerCount("event")).toBe(1);

      await vi.advanceTimersByTimeAsync(25_000);

      await vi.waitFor(() => {
        expect(watcher.listenerCount("event")).toBe(0);
      });

      controller.abort();
    } finally {
      failNextWrite = false;
    }
  });

  it("unwinds the stream callback when a dead connection's response never opens", async () => {
    const watcher = new EventEmitter();
    const app = createApp(deps(watcher));
    const { server, port } = await listen(app);
    // Earlier tests leave callbacks parked on purpose, so the baseline is
    // whatever is already running rather than zero.
    const parked = liveCallbacks;

    try {
      await pipelineThenDestroy(port);

      // The queued request's ServerResponse is never attached to the socket,
      // so it never emits 'close' — the only event @hono/node-server aborts
      // the request signal from. With the abort signal as the sole way out,
      // this stream sits here holding its listener for the life of the
      // process, and no heartbeat or write failure ever dislodges it.
      //
      // Both pipelined callbacks must return, not just shed their listener and
      // slot: a teardown that frees those while leaving the callback parked
      // passes every other assertion here and is worse than the original bug,
      // because the cap it just gave the slot back to no longer bounds it.
      await vi.waitFor(() => {
        expect(watcher.listenerCount("event")).toBe(0);
        expect(liveCallbacks).toBe(parked);
      });

      // ...and its MAX_SSE_CLIENTS slot came back with it: every one of the
      // cap's worth of fresh streams is still admitted, none refused with 503.
      const controllers = Array.from({ length: MAX_SSE_CLIENTS }, () => new AbortController());
      const statuses = await Promise.all(
        controllers.map((controller) => openStream(port, controller.signal)),
      );
      expect(statuses).toEqual(Array.from({ length: MAX_SSE_CLIENTS }, () => 200));

      controllers.forEach((controller) => {
        controller.abort();
      });
      await vi.waitFor(() => {
        expect(watcher.listenerCount("event")).toBe(0);
      });
    } finally {
      server.close();
    }
  });

  // Scope note: this covers the real adapter admitting a connection, delivering
  // to it, and holding its listener until it disconnects. It observes only the
  // few hundred ms the exchange takes, so it does NOT cover surviving a
  // heartbeat — `sends a heartbeat ping and keeps the connection open` covers
  // that on fake timers, and a stream held for 30s of real time across a full
  // interval was measured by hand rather than in CI.
  it("holds a connected client's listener until it disconnects, and delivers to it", async () => {
    const watcher = new EventEmitter();
    const app = createApp(deps(watcher));
    const { server, port } = await listen(app);
    const controller = new AbortController();

    try {
      const res = await fetch(`http://${LOOPBACK}:${String(port)}/api/events`, {
        signal: controller.signal,
      });
      expect(res.status).toBe(200);
      expect(watcher.listenerCount("event")).toBe(1);

      const reader = res.body?.getReader();
      if (!reader) throw new Error("expected a readable body");

      watcher.emit("event", { project: "proj-a", kind: "change" });
      const { value } = await reader.read();
      expect(new TextDecoder().decode(value)).toBe(
        'data: {"project":"proj-a","kind":"change"}\n\n',
      );

      // Tearing down on a connection-level signal must not fire for a client
      // that is simply sitting there reading: this is the case the leak fix
      // would be far worse than the leak if it got wrong.
      expect(watcher.listenerCount("event")).toBe(1);

      controller.abort();
      await vi.waitFor(() => {
        expect(watcher.listenerCount("event")).toBe(0);
      });
    } finally {
      server.close();
    }
  });
});
