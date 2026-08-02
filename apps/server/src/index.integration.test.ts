import { execFileSync } from "node:child_process";
import { EventEmitter } from "node:events";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createApp } from "./app.js";
import { runBeansGraphql } from "./beans/executor.js";
import { discoverProjects } from "./discovery/scan.js";
import { fakeAnalytics } from "./testing/fixtures.js";

const root = mkdtempSync(join(tmpdir(), "srv-it-"));
const projDir = join(root, "demo");

beforeAll(() => {
  mkdirSync(projDir, { recursive: true });
  execFileSync("beans", ["init"], { cwd: projDir });
  execFileSync("beans", ["create", "First bean", "-t", "task"], { cwd: projDir });
});
afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("server integration", () => {
  const run = (cfg: string, q: string, v?: Record<string, unknown>) =>
    runBeansGraphql({ configPath: cfg, query: q, variables: v });
  const listProjects = () => discoverProjects([root], 4);

  it("lists the discovered project", async () => {
    const app = createApp({
      roots: [root],
      scanDepth: 4,
      listProjects,
      runGraphql: run,
      search: () => Promise.resolve({ hits: [], failures: [] }),
      analytics: () => Promise.resolve(fakeAnalytics()),
      watcher: new EventEmitter(),
      trustProxy: false,
    });
    const res = await app.request("/api/projects");
    const body = (await res.json()) as { name: string }[];
    expect(body.map((p) => p.name)).toContain("demo");
  });

  it("passes a query through to the project", async () => {
    const app = createApp({
      roots: [root],
      scanDepth: 4,
      listProjects,
      runGraphql: run,
      search: () => Promise.resolve({ hits: [], failures: [] }),
      analytics: () => Promise.resolve(fakeAnalytics()),
      watcher: new EventEmitter(),
      trustProxy: false,
    });
    const res = await app.request("/api/projects/demo/graphql", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ query: "{ beans { title } }" }),
    });
    const body = (await res.json()) as { data: { beans: { title: string }[] } };
    expect(body.data.beans.some((b) => b.title === "First bean")).toBe(true);
  });
});
