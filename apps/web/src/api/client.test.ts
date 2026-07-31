import { afterEach, describe, expect, it, vi } from "vitest";

import { fetchProjects, projectGraphql } from "./client.js";

afterEach(() => vi.restoreAllMocks());

describe("fetchProjects", () => {
  it("throws when the response is not ok", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("", { status: 500 })),
    );

    await expect(fetchProjects()).rejects.toThrow("request failed: 500");
  });
});

describe("projectGraphql", () => {
  it("unwraps data on success", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify({ data: { bean: { id: "x-1" } } }), { status: 200 }),
      ),
    );
    const out = await projectGraphql<{ bean: { id: string } }>("proj-a", "{ bean { id } }");
    expect(out).toEqual({ bean: { id: "x-1" } });
  });

  it("throws joined messages on errors", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify({ errors: [{ message: "bad parent" }] }), { status: 400 }),
      ),
    );
    await expect(projectGraphql("proj-a", "mutation {}")).rejects.toThrow("bad parent");
  });
});
