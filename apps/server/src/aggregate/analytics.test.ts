import { describe, expect, it, vi } from "vitest";

import { fakeProject } from "../testing/fixtures.js";

import { buildAnalytics } from "./analytics.js";

describe("buildAnalytics", () => {
  it("aggregates totals, per-project counts, and completed-by-month", async () => {
    const run = vi.fn(async () => ({
      beans: [
        { type: "task", status: "completed", updatedAt: "2026-03-14T00:00:00Z" },
        { type: "bug", status: "todo", updatedAt: "2026-03-15T00:00:00Z" },
      ],
    }));
    const a = await buildAnalytics([fakeProject("a")], run);
    expect(a.perProject).toEqual([{ project: "a", total: 2, open: 1 }]);
    expect(a.byType.task).toBe(1);
    expect(a.byStatus.completed).toBe(1);
    expect(a.completedByMonth).toEqual([{ month: "2026-03", count: 1 }]);
  });

  it("skips a project that errors, leaving it at zero counts, and orders projects and months", async () => {
    const run = vi.fn(async (cfg: string) => {
      if (cfg.includes("/broken/")) throw new Error("boom");
      if (cfg.includes("/z/")) {
        return {
          beans: [{ type: "task", status: "completed", updatedAt: "2026-01-05T00:00:00Z" }],
        };
      }
      return {
        beans: [{ type: "task", status: "completed", updatedAt: "2026-02-10T00:00:00Z" }],
      };
    });
    const a = await buildAnalytics(
      [fakeProject("z"), fakeProject("broken"), fakeProject("m")],
      run,
    );
    expect(a.perProject).toEqual([
      { project: "broken", total: 0, open: 0 },
      { project: "m", total: 1, open: 0 },
      { project: "z", total: 1, open: 0 },
    ]);
    expect(a.completedByMonth).toEqual([
      { month: "2026-01", count: 1 },
      { month: "2026-02", count: 1 },
    ]);
  });
});
