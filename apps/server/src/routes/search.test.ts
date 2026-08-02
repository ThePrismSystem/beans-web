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

describe("GET /api/search", () => {
  it("returns hits from deps.search using the q query param", async () => {
    const hit = {
      project: "proj-a",
      bean: {
        id: "x-1",
        title: "auth",
        type: "task" as const,
        status: "todo" as const,
        priority: "normal" as const,
      },
    };
    const d = deps({ search: vi.fn(() => Promise.resolve({ hits: [hit], failures: [] })) });
    const app = createApp(d);
    const res = await app.request("/api/search?q=auth");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ hits: [hit], failures: [] });
    expect(d.search).toHaveBeenCalledWith("auth");
  });

  it("passes an empty string when q is missing", async () => {
    const d = deps();
    const app = createApp(d);
    const res = await app.request("/api/search");
    expect(res.status).toBe(200);
    expect(d.search).toHaveBeenCalledWith("");
  });
});
