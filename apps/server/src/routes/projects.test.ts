import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";
import { createApp } from "../app.js";
import type { AppDeps } from "../app.js";
import { fakeAnalytics, fakeProject } from "../testing/fixtures.js";

const project = fakeProject("proj-a");

function deps(overrides: Partial<AppDeps> = {}): AppDeps {
  return {
    roots: ["/root"],
    scanDepth: 4,
    listProjects: vi.fn(async () => [project]),
    runGraphql: vi.fn(async () => ({})),
    search: vi.fn(async () => ({ hits: [], failures: [] })),
    analytics: vi.fn(async () => fakeAnalytics()),
    watcher: new EventEmitter(),
    trustProxy: false,
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
