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
    allowedHosts: [],
    ...overrides,
  };
}

describe("GET /api/projects", () => {
  it("returns discovered projects without host filesystem paths", async () => {
    const d = deps();
    const app = createApp(d);
    const res = await app.request("/api/projects");
    expect(res.status).toBe(200);
    const body = (await res.json()) as unknown[];
    expect(body).toEqual([{ name: "proj-a", prefix: "x-", counts: project.counts }]);
    for (const entry of body) {
      expect(entry).not.toHaveProperty("path");
      expect(entry).not.toHaveProperty("root");
    }
    expect(d.listProjects).toHaveBeenCalled();
  });
});
