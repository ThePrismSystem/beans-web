import { EventEmitter } from "node:events";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createApp } from "../app.js";
import type { AppDeps } from "../app.js";
import { fakeAnalytics, fakeProject } from "../testing/fixtures.js";

const project = fakeProject("proj-a");

function deps(watcher: EventEmitter, overrides: Partial<AppDeps> = {}): AppDeps {
  return {
    root: "/root",
    scanDepth: 4,
    listProjects: vi.fn(async () => [project]),
    runGraphql: vi.fn(async () => ({})),
    search: vi.fn(async () => ({ hits: [], failures: [] })),
    analytics: vi.fn(async () => fakeAnalytics()),
    watcher,
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
});
