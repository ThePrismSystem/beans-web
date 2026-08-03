import { EventEmitter } from "node:events";

import { afterEach, describe, expect, it, vi } from "vitest";

import { createApp } from "../app.js";
import { fakeAnalytics, fakeProject } from "../testing/fixtures.js";

import { MAX_SSE_CLIENTS } from "./events.js";

import type { AppDeps } from "../app.js";

// hono's StreamingApi.write() swallows every error internally (bare
// `try { await this.writer.write(...) } catch {}`, never rethrown), so
// writeSSE() can never actually reject through any client-observable action
// (aborting, cancelling the reader, etc.) — the events.ts write-failure
// cleanup path is unreachable through the real stream. To exercise it, stub
// streamSSE for one test with a real SSEStreamingApi instance whose writeSSE
// is overridden to reject, which runs events.ts's own catch handler for real.
let failNextWrite = false;

vi.mock("hono/streaming", async (importOriginal) => {
  const actual = await importOriginal<typeof import("hono/streaming")>();
  return {
    ...actual,
    streamSSE: (
      c: Parameters<typeof actual.streamSSE>[0],
      cb: Parameters<typeof actual.streamSSE>[1],
      onError?: Parameters<typeof actual.streamSSE>[2],
    ) => {
      if (!failNextWrite) return actual.streamSSE(c, cb, onError);
      const { readable, writable } = new TransformStream();
      const stream = new actual.SSEStreamingApi(writable, readable);
      stream.writeSSE = () => Promise.reject(new Error("write failed"));
      void cb(stream);
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
    ...overrides,
  };
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
});
