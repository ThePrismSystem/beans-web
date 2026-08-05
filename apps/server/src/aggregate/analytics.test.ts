import { describe, expect, it, vi } from "vitest";

import { fakeProject } from "../testing/fixtures.js";
import { QueueFullError } from "../util/concurrency.js";

import { buildAnalytics } from "./analytics.js";

describe("buildAnalytics", () => {
  it("aggregates totals, per-project counts, and completed-by-month", async () => {
    const run = vi.fn(() =>
      Promise.resolve({
        beans: [
          { type: "task", status: "completed", updatedAt: "2026-03-14T00:00:00Z" },
          { type: "bug", status: "todo", updatedAt: "2026-03-15T00:00:00Z" },
        ],
      }),
    );
    const a = await buildAnalytics([fakeProject("a")], run);
    expect(a.perProject).toEqual([{ project: "a", total: 2, open: 1 }]);
    expect(a.byType.task).toBe(1);
    expect(a.byStatus.completed).toBe(1);
    expect(a.completedByMonth).toEqual([{ month: "2026-03", count: 1 }]);
    expect(a.failures).toEqual([]);
  });

  it("surfaces a project that errors, leaving it at zero counts, and orders projects and months", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const run = vi.fn((cfg: string) => {
      if (cfg.includes("/broken/")) return Promise.reject(new Error("boom"));
      if (cfg.includes("/z/")) {
        return Promise.resolve({
          beans: [{ type: "task", status: "completed", updatedAt: "2026-01-05T00:00:00Z" }],
        });
      }
      return Promise.resolve({
        beans: [{ type: "task", status: "completed", updatedAt: "2026-02-10T00:00:00Z" }],
      });
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
    expect(a.failures).toEqual(["broken"]);
    expect(err).toHaveBeenCalled();
    err.mockRestore();
  });

  it("forwards the signal to every run call so a queued invocation can be abandoned", async () => {
    const controller = new AbortController();
    const run = vi.fn(() => Promise.resolve({ beans: [] }));
    await buildAnalytics([fakeProject("a"), fakeProject("b")], run, controller.signal);
    expect(run).toHaveBeenCalledTimes(2);
    expect(run).toHaveBeenCalledWith(
      "/root/a/.beans.yml",
      "/root/a/.beans",
      "/root",
      expect.any(String),
      undefined,
      controller.signal,
    );
  });

  it("starts no work and logs nothing when the signal has already aborted", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const run = vi.fn(() => Promise.resolve({ beans: [] }));

    await expect(
      buildAnalytics([fakeProject("a"), fakeProject("b")], run, AbortSignal.abort()),
    ).rejects.toThrow();

    expect(run).not.toHaveBeenCalled();
    expect(err).not.toHaveBeenCalled();
    err.mockRestore();
  });

  it("rejects rather than reporting failures when a run is abandoned mid-flight", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const controller = new AbortController();
    const run = vi.fn(() => {
      controller.abort();
      return Promise.reject(new Error("aborted while queued for a beans slot"));
    });

    await expect(
      buildAnalytics([fakeProject("a"), fakeProject("b")], run, controller.signal),
    ).rejects.toThrow(/aborted/);

    expect(err).not.toHaveBeenCalled();
    err.mockRestore();
  });

  it("rejects with QueueFullError instead of reporting every project as failed", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const run = vi.fn(() => Promise.reject(new QueueFullError()));

    await expect(buildAnalytics([fakeProject("a"), fakeProject("b")], run)).rejects.toBeInstanceOf(
      QueueFullError,
    );

    expect(err).not.toHaveBeenCalled();
    err.mockRestore();
  });
});
