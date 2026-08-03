import { EventEmitter } from "node:events";

import { describe, expect, it, vi } from "vitest";

import { createApp } from "../app.js";
import { fakeAnalytics, fakeProject } from "../testing/fixtures.js";

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
    expect(d.analytics).toHaveBeenCalled();
  });
});
