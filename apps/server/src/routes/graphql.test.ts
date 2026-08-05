import { EventEmitter } from "node:events";

import { describe, expect, it, vi } from "vitest";

import { createApp } from "../app.js";
import { BeansError } from "../beans/executor.js";
import { fakeAnalytics, fakeProject } from "../testing/fixtures.js";
import { ContainmentError } from "../util/containment.js";

import type { AppDeps } from "../app.js";

const project = fakeProject("proj-a");

function deps(overrides: Partial<AppDeps> = {}): AppDeps {
  return {
    roots: ["/root"],
    scanDepth: 4,
    listProjects: vi.fn(() => Promise.resolve([project])),
    runGraphql: vi.fn(() => Promise.resolve({ beans: [{ id: "x-1" }] })),
    search: vi.fn(() => Promise.resolve({ hits: [], failures: [] })),
    analytics: vi.fn(() => Promise.resolve(fakeAnalytics())),
    watcher: new EventEmitter(),
    trustProxy: false,
    allowedHosts: [],
    ...overrides,
  };
}

describe("POST /api/projects/:name/graphql", () => {
  it("forwards the query to the named project and returns data", async () => {
    const d = deps();
    const app = createApp(d);
    const res = await app.request("/api/projects/proj-a/graphql", {
      method: "POST",
      headers: { "content-type": "application/json", origin: "http://localhost" },
      body: JSON.stringify({ query: "{ beans { id } }" }),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ data: { beans: [{ id: "x-1" }] } });
    expect(d.runGraphql).toHaveBeenCalledWith(
      "/root/proj-a/.beans.yml",
      project.dataPath,
      project.root,
      "{ beans { id } }",
      undefined,
      // The request's own signal, so a client that hangs up while queued for a
      // subprocess slot drops out of the queue instead of spawning a child.
      expect.any(AbortSignal),
    );
  });

  it("returns 404 for an unknown project", async () => {
    const app = createApp(deps());
    const res = await app.request("/api/projects/nope/graphql", {
      method: "POST",
      headers: { "content-type": "application/json", origin: "http://localhost" },
      body: JSON.stringify({ query: "{ beans { id } }" }),
    });
    expect(res.status).toBe(404);
  });

  it("returns 400 for a malformed body missing a query", async () => {
    const d = deps();
    const app = createApp(d);
    const res = await app.request("/api/projects/proj-a/graphql", {
      method: "POST",
      headers: { "content-type": "application/json", origin: "http://localhost" },
      body: JSON.stringify({ variables: { q: "x" } }),
    });
    expect(res.status).toBe(400);
    expect(d.runGraphql).not.toHaveBeenCalled();
  });

  it("returns 400 with error messages when beans rejects", async () => {
    const d = deps({
      runGraphql: vi.fn(() => Promise.reject(new BeansError("bad parent", ["bad parent"]))),
    });
    const app = createApp(d);
    const res = await app.request("/api/projects/proj-a/graphql", {
      method: "POST",
      headers: { "content-type": "application/json", origin: "http://localhost" },
      body: JSON.stringify({ query: 'mutation { setParent(id:"a",parentId:"b"){id} }' }),
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ errors: [{ message: "bad parent" }] });
  });

  it("re-throws (500) when runGraphql rejects with a plain Error", async () => {
    const d = deps({
      runGraphql: vi.fn(() => Promise.reject(new Error("unexpected failure"))),
    });
    const app = createApp(d);
    const res = await app.request("/api/projects/proj-a/graphql", {
      method: "POST",
      headers: { "content-type": "application/json", origin: "http://localhost" },
      body: JSON.stringify({ query: "{ beans { id } }" }),
    });
    expect(res.status).toBe(500);
  });

  it("returns 404 when the resolved project's root isn't one of the configured roots", async () => {
    const rogueProject = { ...project, root: "/somewhere/else" };
    const app = createApp(deps({ listProjects: vi.fn(() => Promise.resolve([rogueProject])) }));
    const res = await app.request("/api/projects/proj-a/graphql", {
      method: "POST",
      headers: { "content-type": "application/json", origin: "http://localhost" },
      body: JSON.stringify({ query: "{ beans { id } }" }),
    });
    expect(res.status).toBe(404);
  });

  // Regression lock for the round-3 TOCTOU finding: a project's data
  // directory can be swapped for a symlink escaping root after discovery
  // validated it but before a request arrives (discovery's result is cached
  // for CACHE_TTL_MS/REFRESH_INTERVAL_MS). runGraphql (executor.ts)
  // re-checks project.dataPath's containment live, immediately before
  // spawning the beans child, and rejects with a ContainmentError when it no
  // longer holds. This route must map that specifically to 404, the same as
  // an unknown project, rather than let it fall through to the generic
  // BeansError -> 400 path and leak a filesystem path to the client.
  it("returns 404 when runGraphql rejects with a ContainmentError, treating a caught swap like an unknown project", async () => {
    const d = deps({
      runGraphql: vi.fn(() =>
        Promise.reject(new ContainmentError("path is outside its configured root")),
      ),
    });
    const app = createApp(d);
    const res = await app.request("/api/projects/proj-a/graphql", {
      method: "POST",
      headers: { "content-type": "application/json", origin: "http://localhost" },
      body: JSON.stringify({ query: "{ beans { id } }" }),
    });
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ errors: [{ message: "unknown project: proj-a" }] });
  });

  // Redaction itself is covered where it happens — the unit tests on
  // redactPaths, and the end-to-end tests in executor.test.ts that drive a
  // real stderr through runBeansGraphql -> extractBeansErrorMessage. This
  // test covers a different concern: that the route forwards an already-
  // redacted BeansError's messages into the JSON response unchanged, rather
  // than mangling or dropping them.
  it("forwards an already-redacted BeansError message into the response unchanged", async () => {
    const redactedMessage = "loading beans: loading broken.md: parsing front matter";
    const app = createApp(
      deps({
        runGraphql: vi.fn(() => {
          throw new BeansError(redactedMessage);
        }),
      }),
    );

    const res = await app.request("/api/projects/proj-a/graphql", {
      method: "POST",
      headers: { "content-type": "application/json", origin: "http://localhost" },
      body: JSON.stringify({ query: "{ beans { id } }" }),
    });

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ errors: [{ message: redactedMessage }] });
  });

  it("rejects an over-sized request body with 413", async () => {
    const d = deps();
    const app = createApp(d);
    const huge = "x".repeat(300 * 1024);
    const res = await app.request("/api/projects/proj-a/graphql", {
      method: "POST",
      headers: { "content-type": "application/json", origin: "http://localhost" },
      body: JSON.stringify({ query: `{ beans { id } } ${huge}` }),
    });
    expect(res.status).toBe(413);
    expect(d.runGraphql).not.toHaveBeenCalled();
  });
});
