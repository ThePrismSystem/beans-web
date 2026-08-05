import { EventEmitter } from "node:events";

import { describe, expect, it, vi } from "vitest";

import { createApp } from "../app.js";
import { fakeAnalytics, fakeProject } from "../testing/fixtures.js";
import { QueueFullError } from "../util/concurrency.js";

import type { AppDeps } from "../app.js";

const project = fakeProject("proj-a");

function deps(overrides: Partial<AppDeps> = {}): AppDeps {
  return {
    roots: ["/root"],
    scanDepth: 4,
    listProjects: vi.fn(() => Promise.resolve([project])),
    runGraphql: vi.fn(() => Promise.resolve({})),
    search: vi.fn(() => Promise.resolve({ hits: [], failures: [] })),
    analytics: vi.fn(() => Promise.resolve(fakeAnalytics())),
    watcher: new EventEmitter(),
    trustProxy: false,
    allowedHosts: [],
    ...overrides,
  };
}

describe("GET /api/analytics", () => {
  it("returns the aggregated analytics from deps.analytics", async () => {
    const analytics = {
      ...fakeAnalytics(),
      perProject: [{ project: "proj-a", total: 2, open: 1 }],
      completedByMonth: [{ month: "2026-03", count: 1 }],
    };
    const d = deps({ analytics: vi.fn(() => Promise.resolve(analytics)) });
    const app = createApp(d);
    const res = await app.request("/api/analytics");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(analytics);
    // The request's own signal, so a client that navigates away stops the
    // remaining per-project invocations instead of queueing them all.
    expect(d.analytics).toHaveBeenCalledWith(expect.any(AbortSignal));
  });

  it("answers 503 with Retry-After when the beans queue is full", async () => {
    const d = deps({ analytics: vi.fn(() => Promise.reject(new QueueFullError())) });
    const res = await createApp(d).request("/api/analytics");
    expect(res.status).toBe(503);
    expect(res.headers.get("Retry-After")).toBeTruthy();
  });

  it("answers 499 without logging when the client has already hung up", async () => {
    const controller = new AbortController();
    controller.abort();
    const d = deps({
      analytics: vi.fn(() => Promise.reject(new Error("aborted while queued for a beans slot"))),
    });
    const res = await createApp(d).request("/api/analytics", { signal: controller.signal });
    expect(res.status).toBe(499);
  });

  it("still returns 500 for an unexpected failure on a live connection", async () => {
    const d = deps({ analytics: vi.fn(() => Promise.reject(new Error("unexpected failure"))) });
    const res = await createApp(d).request("/api/analytics");
    expect(res.status).toBe(500);
  });
});
