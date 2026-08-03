import { execFile } from "node:child_process";

import { describe, expect, it, vi } from "vitest";

import { BEANS_CONCURRENCY } from "../util/concurrency.js";

import {
  BEANS_EXEC_TIMEOUT_MS,
  buildBeansArgs,
  BeansError,
  parseBeansResult,
  runBeansGraphql,
} from "./executor.js";

type ExecFileCallback = (
  error: (Error & { stderr?: string; stdout?: string }) | null,
  stdout: string,
  stderr: string,
) => void;

// The default mock fails fast, which is what the error-handling tests below
// want. `holdCallbacks` switches it to parking each invocation so a test can
// observe how many children are in flight at once.
let holdCallbacks = false;
let inFlight = 0;
let peakInFlight = 0;
const held: (() => void)[] = [];

vi.mock("node:child_process", () => ({
  execFile: vi.fn(
    (_file: string, _args: string[], _options: unknown, callback: ExecFileCallback) => {
      inFlight += 1;
      peakInFlight = Math.max(peakInFlight, inFlight);
      const finish = (): void => {
        inFlight -= 1;
        const err = Object.assign(new Error("real error message"), {
          stderr: "no error-line prefix here\n",
        });
        callback(err, "", "");
      };
      if (holdCallbacks) held.push(finish);
      else finish();
    },
  ),
}));

describe("buildBeansArgs", () => {
  it("passes config, json flag, and query as separate argv entries (no shell)", () => {
    const args = buildBeansArgs({ configPath: "/x/.beans.yml", query: "{ beans { id } }" });
    expect(args).toEqual([
      "graphql",
      "--json",
      "--config",
      "/x/.beans.yml",
      "--",
      "{ beans { id } }",
    ]);
  });
  it("keeps a flag-shaped query positional so it cannot be parsed as a beans flag", () => {
    const args = buildBeansArgs({ configPath: "/x/.beans.yml", query: "--beans-path=/etc" });
    const sep = args.indexOf("--");
    expect(sep).toBeGreaterThan(-1);
    expect(args[sep + 1]).toBe("--beans-path=/etc");
    expect(args[args.length - 1]).toBe("--beans-path=/etc");
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

  it("passes a timeout and SIGKILL so a hung beans child is reaped", async () => {
    await runBeansGraphql({ configPath: "/x/.beans.yml", query: "{ beans { id } }" }).catch(
      () => {},
    );
    const options = vi.mocked(execFile).mock.calls.at(-1)?.[2] as {
      timeout?: number;
      killSignal?: string;
    };
    expect(options.timeout).toBe(BEANS_EXEC_TIMEOUT_MS);
    expect(options.killSignal).toBe("SIGKILL");
  });
});

describe("runBeansGraphql concurrency", () => {
  it("never spawns more than BEANS_CONCURRENCY children at once", async () => {
    holdCallbacks = true;
    inFlight = 0;
    peakInFlight = 0;
    held.length = 0;
    try {
      const calls = Array.from({ length: 40 }, () =>
        runBeansGraphql({ configPath: "/x/.beans.yml", query: "{ beans { id } }" }).catch(
          () => undefined,
        ),
      );

      await vi.waitFor(() => {
        expect(held.length).toBe(BEANS_CONCURRENCY);
      });
      expect(peakInFlight).toBeLessThanOrEqual(BEANS_CONCURRENCY);

      // Drain: each completion frees a slot for the next queued caller.
      while (held.length > 0) {
        held.shift()?.();
        await Promise.resolve();
      }
      await Promise.all(calls);

      expect(peakInFlight).toBeLessThanOrEqual(BEANS_CONCURRENCY);
    } finally {
      holdCallbacks = false;
      held.length = 0;
    }
  });
});
