import { describe, expect, it, vi } from "vitest";
import { createApp } from "../app.js";
import type { AppDeps } from "../app.js";
import type { BeanStatus, BeanType, Project, ProjectCounts } from "@beans-frontend/shared";
import { BEAN_STATUSES, BEAN_TYPES } from "@beans-frontend/shared";

function fakeCounts(): ProjectCounts {
  const byType = Object.fromEntries(BEAN_TYPES.map((t) => [t, 0])) as Record<BeanType, number>;
  const byStatus = Object.fromEntries(BEAN_STATUSES.map((s) => [s, 0])) as Record<
    BeanStatus,
    number
  >;
  return { total: 0, open: 0, byType, byStatus };
}

const project: Project = {
  name: "proj-a",
  path: "/root/proj-a",
  prefix: "x-",
  counts: fakeCounts(),
};

function deps(overrides: Partial<AppDeps> = {}): AppDeps {
  return {
    root: "/root",
    scanDepth: 4,
    listProjects: vi.fn(async () => [project]),
    runGraphql: vi.fn(async () => ({})),
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
