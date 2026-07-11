import { describe, expect, it } from "vitest";
import { buildBeansArgs, parseBeansResult, BeansError } from "./executor.js";

describe("buildBeansArgs", () => {
  it("passes config, json flag, and query as separate argv entries (no shell)", () => {
    const args = buildBeansArgs({ configPath: "/x/.beans.yml", query: "{ beans { id } }" });
    expect(args).toEqual(["graphql", "--json", "--config", "/x/.beans.yml", "{ beans { id } }"]);
  });
  it("adds -v when variables are provided", () => {
    const args = buildBeansArgs({
      configPath: "/x/.beans.yml",
      query: "q",
      variables: { id: "a" },
    });
    expect(args).toContain("-v");
    expect(args).toContain(JSON.stringify({ id: "a" }));
  });
});

describe("parseBeansResult", () => {
  it("returns data on success", () => {
    expect(parseBeansResult('{"data":{"beans":[]}}')).toEqual({ beans: [] });
  });
  it("throws BeansError listing GraphQL error messages", () => {
    expect(() => parseBeansResult('{"errors":[{"message":"bad parent"}]}')).toThrowError(
      BeansError,
    );
  });
});
