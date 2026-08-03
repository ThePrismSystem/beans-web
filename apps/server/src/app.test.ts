import { EventEmitter } from "node:events";

import { describe, expect, it, vi } from "vitest";

import { createApp } from "./app.js";
import { fakeAnalytics, fakeProject } from "./testing/fixtures.js";

import type { AppDeps } from "./app.js";

function deps(overrides: Partial<AppDeps> = {}): AppDeps {
  return {
    roots: ["/root"],
    scanDepth: 4,
    listProjects: vi.fn(() => Promise.resolve([fakeProject("proj-a")])),
    runGraphql: vi.fn(() => Promise.resolve({})),
    search: vi.fn(() => Promise.resolve({ hits: [], failures: [] })),
    analytics: vi.fn(() => Promise.resolve(fakeAnalytics())),
    watcher: new EventEmitter(),
    trustProxy: false,
    ...overrides,
  };
}

describe("security headers", () => {
  it("sets nosniff and a frame-ancestors CSP on responses", async () => {
    const res = await createApp(deps()).request("/api/projects");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("content-security-policy")).toContain("frame-ancestors 'none'");
  });
});

describe("request logging", () => {
  it("logs API requests", async () => {
    const log = vi.spyOn(console, "info").mockImplementation(() => undefined);

    await createApp(deps()).request("/api/projects");

    expect(log).toHaveBeenCalled();
    expect(log.mock.calls.flat().join(" ")).toContain("/api/projects");
  });

  it("does not log the graphql query or variables", async () => {
    const log = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const secret = "SENTINEL_BEAN_BODY_TEXT";

    await createApp(deps()).request("/api/projects/proj-a/graphql", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ query: `{ beans { ${secret} } }`, variables: { note: secret } }),
    });

    const logged = log.mock.calls.flat().join(" ");
    expect(logged).toContain("/api/projects/proj-a/graphql");
    expect(logged).not.toContain(secret);
  });

  it("does not log the search query text", async () => {
    const log = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const secret = "SENTINEL_SEARCH_TEXT";

    await createApp(deps()).request(`/api/search?q=${secret}`);

    const logged = log.mock.calls.flat().join(" ");
    expect(logged).toContain("/api/search");
    expect(logged).not.toContain(secret);
  });

  it("logs a request rejected by the CSRF guard, so middleware order stays load-bearing", async () => {
    const log = vi.spyOn(console, "info").mockImplementation(() => undefined);

    const res = await createApp(deps()).request("/api/projects/proj-a/graphql", {
      method: "POST",
      headers: { "content-type": "application/json", origin: "http://evil.example" },
      body: JSON.stringify({ query: "{ beans { id } }" }),
    });

    expect(res.status).toBe(403);
    expect(log.mock.calls.flat().join(" ")).toContain("/api/projects/proj-a/graphql");
  });
});
