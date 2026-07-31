import { describe, expect, it, vi } from "vitest";
import { buildBeansArgs, BeansError, parseBeansResult, runBeansGraphql } from "./executor.js";

type ExecFileCallback = (
  error: (Error & { stderr?: string; stdout?: string }) | null,
  stdout: string,
  stderr: string,
) => void;

vi.mock("node:child_process", () => ({
  execFile: vi.fn(
    (_file: string, _args: string[], _options: unknown, callback: ExecFileCallback) => {
      const err = Object.assign(new Error("real error message"), {
        stderr: "no error-line prefix here\n",
      });
      callback(err, "", "");
    },
  ),
}));

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
  it("returns the raw result object the binary prints on success", () => {
    expect(parseBeansResult('{"beans":[]}')).toEqual({ beans: [] });
  });
  it("unwraps a `data` envelope if one is present (forward-compat)", () => {
    expect(parseBeansResult('{"data":{"beans":[]}}')).toEqual({ beans: [] });
  });
});

describe("runBeansGraphql", () => {
  it("falls back to err.message when stderr doesn't match the ERROR_LINE pattern", async () => {
    const err = await runBeansGraphql({
      configPath: "/x/.beans.yml",
      query: "{ beans { id } }",
    }).catch((e: unknown) => e);

    if (!(err instanceof BeansError)) throw new Error("expected a BeansError");
    expect(err.message).toBe("real error message");
  });
});
