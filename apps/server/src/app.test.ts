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
