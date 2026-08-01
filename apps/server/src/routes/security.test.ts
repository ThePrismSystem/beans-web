import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";
import { createApp } from "../app.js";
import type { AppDeps } from "../app.js";
import { fakeAnalytics, fakeProject } from "../testing/fixtures.js";

function deps(overrides: Partial<AppDeps> = {}): AppDeps {
  return {
    roots: ["/root"],
    scanDepth: 4,
    listProjects: vi.fn(async () => [fakeProject("proj-a")]),
    runGraphql: vi.fn(async () => ({ beans: [] })),
    search: vi.fn(async () => ({ hits: [], failures: [] })),
    analytics: vi.fn(async () => fakeAnalytics()),
    watcher: new EventEmitter(),
    ...overrides,
  };
}

const url = "/api/projects/proj-a/graphql";
const body = JSON.stringify({ query: "{ beans { id } }" });

describe("cross-origin guard", () => {
  it("rejects a cross-origin POST with 403", async () => {
    const res = await createApp(deps()).request(url, {
      method: "POST",
      headers: { "content-type": "application/json", origin: "http://evil.example" },
      body,
    });
    expect(res.status).toBe(403);
  });

  it("rejects a non-JSON content-type with 415", async () => {
    const res = await createApp(deps()).request(url, {
      method: "POST",
      headers: { "content-type": "text/plain" },
      body,
    });
    expect(res.status).toBe(415);
  });

  it("allows a same-origin JSON POST", async () => {
    const res = await createApp(deps()).request(url, {
      method: "POST",
      headers: { "content-type": "application/json", origin: "http://localhost" },
      body,
    });
    expect(res.status).toBe(200);
  });

  it("allows a POST with no Origin header (non-browser client)", async () => {
    const res = await createApp(deps()).request(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
    });
    expect(res.status).toBe(200);
  });

  it("leaves cross-origin GET reads untouched", async () => {
    const res = await createApp(deps()).request("/api/projects", {
      headers: { origin: "http://evil.example" },
    });
    expect(res.status).toBe(200);
  });
});
