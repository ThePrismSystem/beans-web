import { describe, expect, it, vi } from "vitest";

import { fakeProject } from "../testing/fixtures.js";
import { QueueFullError } from "../util/concurrency.js";

import { globalSearch } from "./search.js";

describe("globalSearch", () => {
  it("queries each project with the search filter and tags hits with project name", async () => {
    const run = vi.fn((cfg: string) =>
      cfg.includes("/a/")
        ? Promise.resolve({
            beans: [{ id: "x-1", title: "auth", type: "task", status: "todo", priority: "normal" }],
          })
        : Promise.resolve({ beans: [] }),
    );
    const result = await globalSearch([fakeProject("a"), fakeProject("b")], "auth", run);
    expect(result.hits).toEqual([
      {
        project: "a",
        bean: { id: "x-1", title: "auth", type: "task", status: "todo", priority: "normal" },
      },
    ]);
    expect(result.failures).toEqual([]);
    expect(run).toHaveBeenCalledTimes(2);
  });

  it("surfaces a failed project rather than failing the whole search", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const run = vi.fn((cfg: string) => {
      if (cfg.includes("/a/")) return Promise.reject(new Error("boom"));
      return Promise.resolve({
        beans: [{ id: "x-2", title: "auth", type: "bug", status: "todo", priority: "high" }],
      });
    });
    const result = await globalSearch([fakeProject("a"), fakeProject("b")], "auth", run);
    expect(result.hits.map((h) => h.project)).toEqual(["b"]);
    expect(result.failures).toEqual(["a"]);
    expect(err).toHaveBeenCalled();
    err.mockRestore();
  });

  it("forwards the signal to every run call so a queued invocation can be abandoned", async () => {
    const controller = new AbortController();
    const run = vi.fn(() => Promise.resolve({ beans: [] }));
    await globalSearch([fakeProject("a"), fakeProject("b")], "auth", run, controller.signal);
    expect(run).toHaveBeenCalledTimes(2);
    expect(run).toHaveBeenCalledWith(
      "/root/a/.beans.yml",
      "/root/a/.beans",
      "/root",
      expect.any(String),
      { q: "auth" },
      controller.signal,
    );
  });

  // The audit's finding: 200 abandoned requests kept spawning `beans` children
  // for over a minute. Starting no further work is the whole point — and doing
  // it without logging, because one console.error per remaining project turns a
  // burst of abandoned requests into thousands of log lines.
  it("starts no work and logs nothing when the signal has already aborted", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const run = vi.fn(() => Promise.resolve({ beans: [] }));

    await expect(
      globalSearch([fakeProject("a"), fakeProject("b")], "auth", run, AbortSignal.abort()),
    ).rejects.toThrow();

    expect(run).not.toHaveBeenCalled();
    expect(err).not.toHaveBeenCalled();
    err.mockRestore();
  });

  // A client that hangs up mid-flight: the first project is already queued, so
  // its rejection arrives through the ordinary catch. It must not be recorded
  // as a project failure.
  it("rejects rather than reporting failures when a run is abandoned mid-flight", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const controller = new AbortController();
    const run = vi.fn(() => {
      controller.abort();
      return Promise.reject(new Error("aborted while queued for a beans slot"));
    });

    await expect(
      globalSearch([fakeProject("a"), fakeProject("b")], "auth", run, controller.signal),
    ).rejects.toThrow(/aborted/);

    expect(err).not.toHaveBeenCalled();
    err.mockRestore();
  });

  // The trap this task exists to avoid: a saturated queue answering 200 with
  // every project listed as failed reads to a client as "your projects are
  // broken", not "try again".
  it("rejects with QueueFullError instead of reporting every project as failed", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const run = vi.fn(() => Promise.reject(new QueueFullError()));

    await expect(
      globalSearch([fakeProject("a"), fakeProject("b")], "auth", run),
    ).rejects.toBeInstanceOf(QueueFullError);

    expect(err).not.toHaveBeenCalled();
    err.mockRestore();
  });
});
