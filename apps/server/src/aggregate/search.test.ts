import { describe, expect, it, vi } from "vitest";

import { fakeProject } from "../testing/fixtures.js";

import { globalSearch } from "./search.js";

describe("globalSearch", () => {
  it("queries each project with the search filter and tags hits with project name", async () => {
    const run = vi.fn(async (cfg: string) =>
      cfg.includes("/a/")
        ? {
            beans: [{ id: "x-1", title: "auth", type: "task", status: "todo", priority: "normal" }],
          }
        : { beans: [] },
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
    const run = vi.fn(async (cfg: string) => {
      if (cfg.includes("/a/")) throw new Error("boom");
      return {
        beans: [{ id: "x-2", title: "auth", type: "bug", status: "todo", priority: "high" }],
      };
    });
    const result = await globalSearch([fakeProject("a"), fakeProject("b")], "auth", run);
    expect(result.hits.map((h) => h.project)).toEqual(["b"]);
    expect(result.failures).toEqual(["a"]);
    expect(err).toHaveBeenCalled();
    err.mockRestore();
  });
});
