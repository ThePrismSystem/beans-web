import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";
import { createApp } from "../app.js";
import type { AppDeps } from "../app.js";
import { BeansError } from "../beans/executor.js";
import { fakeAnalytics, fakeProject } from "../testing/fixtures.js";

const project = fakeProject("proj-a");

function deps(overrides: Partial<AppDeps> = {}): AppDeps {
  return {
    root: "/root",
    scanDepth: 4,
    listProjects: vi.fn(async () => [project]),
    runGraphql: vi.fn(async () => ({ beans: [{ id: "x-1" }] })),
    search: vi.fn(async () => []),
    analytics: vi.fn(async () => fakeAnalytics()),
    watcher: new EventEmitter(),
    ...overrides,
  };
}

describe("POST /api/projects/:name/graphql", () => {
  it("forwards the query to the named project and returns data", async () => {
    const d = deps();
    const app = createApp(d);
    const res = await app.request("/api/projects/proj-a/graphql", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ query: "{ beans { id } }" }),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ data: { beans: [{ id: "x-1" }] } });
    expect(d.runGraphql).toHaveBeenCalledWith(
      "/root/proj-a/.beans.yml",
      "{ beans { id } }",
      undefined,
    );
  });

  it("returns 404 for an unknown project", async () => {
    const app = createApp(deps());
    const res = await app.request("/api/projects/nope/graphql", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ query: "{ beans { id } }" }),
    });
    expect(res.status).toBe(404);
  });

  it("returns 400 with error messages when beans rejects", async () => {
    const d = deps({
      runGraphql: vi.fn(async () => {
        throw new BeansError("bad parent", ["bad parent"]);
      }),
    });
    const app = createApp(d);
    const res = await app.request("/api/projects/proj-a/graphql", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ query: 'mutation { setParent(id:"a",parentId:"b"){id} }' }),
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ errors: [{ message: "bad parent" }] });
  });
});
