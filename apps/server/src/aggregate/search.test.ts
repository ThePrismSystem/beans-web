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
    const hits = await globalSearch([fakeProject("a"), fakeProject("b")], "auth", run);
    expect(hits).toEqual([
      {
        project: "a",
        bean: { id: "x-1", title: "auth", type: "task", status: "todo", priority: "normal" },
      },
    ]);
    expect(run).toHaveBeenCalledTimes(2);
  });

  it("skips a project that errors rather than failing the whole search", async () => {
    const run = vi.fn(async (cfg: string) => {
      if (cfg.includes("/a/")) throw new Error("boom");
      return {
        beans: [{ id: "x-2", title: "auth", type: "bug", status: "todo", priority: "high" }],
      };
    });
    const hits = await globalSearch([fakeProject("a"), fakeProject("b")], "auth", run);
    expect(hits.map((h) => h.project)).toEqual(["b"]);
  });
});
