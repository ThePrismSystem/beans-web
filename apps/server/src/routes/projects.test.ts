import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";
import { createApp } from "../app.js";
import type { AppDeps } from "../app.js";
import { fakeAnalytics, fakeProject } from "../testing/fixtures.js";

const project = fakeProject("proj-a");

function deps(overrides: Partial<AppDeps> = {}): AppDeps {
  return {
    root: "/root",
    scanDepth: 4,
    listProjects: vi.fn(async () => [project]),
    runGraphql: vi.fn(async () => ({})),
    search: vi.fn(async () => []),
    analytics: vi.fn(async () => fakeAnalytics()),
    watcher: new EventEmitter(),
    ...overrides,
  };
}

describe("GET /api/projects", () => {
  it("returns the list of discovered projects", async () => {
    const d = deps();
    const app = createApp(d);
    const res = await app.request("/api/projects");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([project]);
    expect(d.listProjects).toHaveBeenCalled();
  });
});
