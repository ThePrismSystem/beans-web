import { execFile } from "node:child_process";

import { afterEach, describe, expect, it, vi } from "vitest";

import { BEANS_CONCURRENCY } from "../util/concurrency.js";

import {
  BEANS_EXEC_TIMEOUT_MS,
  buildBeansArgs,
  BeansError,
  parseBeansResult,
  redactPaths,
  runBeansGraphql,
} from "./executor.js";

type ExecFileCallback = (error: unknown, stdout: string, stderr: string) => void;

const DEFAULT_ERROR = (): unknown =>
  Object.assign(new Error("real error message"), {
    stderr: "no error-line prefix here\n",
  });

// The default mock fails fast, which is what the error-handling tests below
// want. `holdCallbacks` switches it to parking each invocation so a test can
// observe how many children are in flight at once. `mockError` is settable
// per test so a test can drive a specific rejection value through the real
// execFile -> extractBeansErrorMessage -> BeansError path, rather than
// calling redactPaths directly.
let holdCallbacks = false;
let inFlight = 0;
let peakInFlight = 0;
const held: (() => void)[] = [];
let mockError: unknown = DEFAULT_ERROR();

vi.mock("node:child_process", () => ({
  execFile: vi.fn(
    (_file: string, _args: string[], _options: unknown, callback: ExecFileCallback) => {
      inFlight += 1;
      peakInFlight = Math.max(peakInFlight, inFlight);
      const finish = (): void => {
        inFlight -= 1;
        callback(mockError, "", "");
      };
      if (holdCallbacks) held.push(finish);
      else finish();
    },
  ),
}));

afterEach(() => {
  mockError = DEFAULT_ERROR();
});

// "/x" doesn't exist on the test machine, and nothing under it is symlinked,
// so the real (unmocked) containment re-check every runBeansGraphql call now
// performs resolves it to itself and finds it contained under root "/x" -
// confirmed directly against node:fs/promises before relying on it here.
// Tests below that care about the check's own behavior mock it explicitly;
// every other test lets it run for real, the same as it will in production.
const ROOT = "/x";

describe("buildBeansArgs", () => {
  it("passes config, beans-path, json flag, and query as separate argv entries (no shell)", () => {
    const args = buildBeansArgs({
      configPath: "/x/.beans.yml",
      root: ROOT,
      beansPath: "/x/.beans",
      query: "{ beans { id } }",
    });
    expect(args).toEqual([
      "graphql",
      "--json",
      "--config",
      "/x/.beans.yml",
      "--beans-path",
      "/x/.beans",
      "--",
      "{ beans { id } }",
    ]);
  });
  it("keeps a flag-shaped query positional so it cannot be parsed as a beans flag", () => {
    const args = buildBeansArgs({
      configPath: "/x/.beans.yml",
      root: ROOT,
      beansPath: "/x/.beans",
      query: "--beans-path=/etc",
    });
    const sep = args.indexOf("--");
    expect(sep).toBeGreaterThan(-1);
    expect(args[sep + 1]).toBe("--beans-path=/etc");
    expect(args[args.length - 1]).toBe("--beans-path=/etc");
  });
  it("adds -v when variables are provided", () => {
    const args = buildBeansArgs({
      configPath: "/x/.beans.yml",
      root: ROOT,
      beansPath: "/x/.beans",
      query: "q",
      variables: { id: "a" },
    });
    expect(args).toContain("-v");
    expect(args).toContain(JSON.stringify({ id: "a" }));
  });
  it("places --beans-path before the -- separator so it is parsed as a flag, not a positional", () => {
    const args = buildBeansArgs({
      configPath: "/x/.beans.yml",
      root: ROOT,
      beansPath: "/x/.beans",
      query: "q",
    });
    const sep = args.indexOf("--");
    const flagIndex = args.indexOf("--beans-path");
    expect(flagIndex).toBeGreaterThan(-1);
    expect(flagIndex).toBeLessThan(sep);
    expect(args[flagIndex + 1]).toBe("/x/.beans");
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
      root: ROOT,
      beansPath: "/x/.beans",
      query: "{ beans { id } }",
    }).catch((e: unknown) => e);

    if (!(err instanceof BeansError)) throw new Error("expected a BeansError");
    expect(err.message).toBe("real error message");
  });

  it("passes a timeout and SIGKILL so a hung beans child is reaped", async () => {
    await runBeansGraphql({
      configPath: "/x/.beans.yml",
      root: ROOT,
      beansPath: "/x/.beans",
      query: "{ beans { id } }",
    }).catch(() => {});
    const options = vi.mocked(execFile).mock.calls.at(-1)?.[2] as {
      timeout?: number;
      killSignal?: string;
    };
    expect(options.timeout).toBe(BEANS_EXEC_TIMEOUT_MS);
    expect(options.killSignal).toBe("SIGKILL");
  });

  // An empty --beans-path makes the CLI fall back to trusting the config
  // file's own beans.path - the exact bypass the --beans-path scheme exists
  // to close. Nothing today passes "" (dataPath always comes from resolve()),
  // but that's an invariant worth asserting rather than leaving unstated.
  // Checked as a plain Error (not a BeansError, and never reaching execFile
  // at all): this is a caller bug, not a beans-side query error to show a
  // client at 400.
  it("rejects with a plain Error and never calls execFile when beansPath is empty", async () => {
    const callsBefore = vi.mocked(execFile).mock.calls.length;

    const err = await runBeansGraphql({
      configPath: "/x/.beans.yml",
      root: ROOT,
      beansPath: "",
      query: "q",
    }).then(
      () => {
        throw new Error("expected runBeansGraphql to reject");
      },
      (e: unknown) => e,
    );

    expect(err).toBeInstanceOf(Error);
    expect(err).not.toBeInstanceOf(BeansError);
    expect((err as Error).message).toMatch(/beansPath must not be empty/);
    expect(vi.mocked(execFile).mock.calls.length).toBe(callsBefore);
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
        runBeansGraphql({
          configPath: "/x/.beans.yml",
          root: ROOT,
          beansPath: "/x/.beans",
          query: "{ beans { id } }",
        }).catch(() => undefined),
      );

      await vi.waitFor(() => {
        expect(held.length).toBe(BEANS_CONCURRENCY);
      });
      expect(peakInFlight).toBeLessThanOrEqual(BEANS_CONCURRENCY);

      // Drain: each completion frees a slot for the next queued caller. Wait
      // for that caller to actually reach the mock rather than assuming a fixed
      // microtask depth — the release path is reject -> catch -> finally ->
      // release -> acquire, and lengthening it would leave callers queued and
      // hang this loop at its timeout instead of failing legibly.
      let remaining = calls.length;
      while (remaining > 0) {
        const next = held.shift();
        if (!next) {
          await vi.waitFor(() => {
            expect(held.length).toBeGreaterThan(0);
          });
          continue;
        }
        next();
        remaining -= 1;
      }
      await Promise.all(calls);

      expect(peakInFlight).toBeLessThanOrEqual(BEANS_CONCURRENCY);
    } finally {
      holdCallbacks = false;
      held.length = 0;
    }
  });
});

// Round-4 finding: the live containment re-check (assertDataPathStillContained)
// was being called by routes/graphql.ts BEFORE runBeansGraphql was even
// reached — i.e. before queueing for a concurrency slot, not after. With the
// pool full and each child bounded only by BEANS_EXEC_TIMEOUT_MS, a queued
// caller can wait seconds for its turn, leaving that entire wait unguarded.
// The check now lives inside runBeansGraphql, inside withBeansSlot, so it
// only runs once a slot is actually granted, immediately before the spawn.
// These tests prove that placement empirically rather than by code reading.
describe("runBeansGraphql containment re-check", () => {
  it("checks containment before spawning the child, not after", async () => {
    const containment = await import("../util/containment.js");
    const order: string[] = [];
    const checkSpy = vi
      .spyOn(containment, "assertDataPathStillContained")
      .mockImplementation(() => {
        order.push("containment-check");
        return Promise.resolve();
      });

    holdCallbacks = true;
    held.length = 0;
    try {
      const promise = runBeansGraphql({
        configPath: "/x/.beans.yml",
        root: ROOT,
        beansPath: "/x/.beans",
        query: "q",
      }).catch(() => undefined);

      // Waiting for the (real, default) execFile mock to have parked a
      // callback is proof the containment check - mocked above to resolve
      // immediately - already ran: runBeansGraphql only reaches execFileAsync
      // after awaiting it.
      await vi.waitFor(() => {
        expect(held.length).toBe(1);
      });
      order.push("execFile");

      held.shift()?.();
      await promise;

      expect(order).toEqual(["containment-check", "execFile"]);
    } finally {
      holdCallbacks = false;
      held.length = 0;
      checkSpy.mockRestore();
    }
  });

  it("propagates a containment failure as-is, without ever calling execFile", async () => {
    const containment = await import("../util/containment.js");
    const checkSpy = vi
      .spyOn(containment, "assertDataPathStillContained")
      .mockRejectedValue(new containment.ContainmentError("path is outside its configured root"));
    const callsBefore = vi.mocked(execFile).mock.calls.length;

    try {
      const err = await runBeansGraphql({
        configPath: "/x/.beans.yml",
        root: ROOT,
        beansPath: "/x/.beans",
        query: "q",
      }).then(
        () => {
          throw new Error("expected runBeansGraphql to reject");
        },
        (e: unknown) => e,
      );

      expect(err).toBeInstanceOf(containment.ContainmentError);
      expect(err).not.toBeInstanceOf(BeansError);
      expect(vi.mocked(execFile).mock.calls.length).toBe(callsBefore);
    } finally {
      checkSpy.mockRestore();
    }
  });

  it("checks containment only once a concurrency slot is actually granted, not while merely queued", async () => {
    const containment = await import("../util/containment.js");
    const checkSpy = vi
      .spyOn(containment, "assertDataPathStillContained")
      .mockResolvedValue(undefined);

    holdCallbacks = true;
    inFlight = 0;
    peakInFlight = 0;
    held.length = 0;
    try {
      const opts = {
        configPath: "/x/.beans.yml",
        root: ROOT,
        beansPath: "/x/.beans",
        query: "q",
      };
      const blockers = Array.from({ length: BEANS_CONCURRENCY }, () =>
        runBeansGraphql(opts).catch(() => undefined),
      );
      await vi.waitFor(() => {
        expect(held.length).toBe(BEANS_CONCURRENCY);
      });
      checkSpy.mockClear();

      // Every slot is held, so this 9th call can only be queued behind them.
      // This assertion is deterministic, not timing-based: withBeansSlot's
      // acquire() returns a promise that only resolves once release() below
      // serves this caller's waiter, so nothing in its body — including the
      // containment check — can run before then.
      const queued = runBeansGraphql(opts).catch(() => undefined);
      expect(checkSpy).not.toHaveBeenCalled();

      // Free exactly one slot. FIFO hands it to the queued call, which must
      // run its containment check before it can reach its own execFile call.
      held.shift()?.();
      await vi.waitFor(() => {
        expect(checkSpy).toHaveBeenCalledTimes(1);
      });

      // Drain everything else so the test doesn't leak parked callbacks: the
      // 7 original blockers still held, plus the queued call's own.
      let remaining = BEANS_CONCURRENCY;
      while (remaining > 0) {
        const next = held.shift();
        if (!next) {
          await vi.waitFor(() => {
            expect(held.length).toBeGreaterThan(0);
          });
          continue;
        }
        next();
        remaining -= 1;
      }
      await Promise.all([...blockers, queued]);
    } finally {
      holdCallbacks = false;
      held.length = 0;
      checkSpy.mockRestore();
    }
  });
});

describe("error message redaction", () => {
  it("reduces an absolute path to its basename", () => {
    expect(
      redactPaths(
        "loading beans: loading /home/alice/git/proj/.beans/broken.md: parsing front matter",
      ),
    ).toBe("loading beans: loading broken.md: parsing front matter");
  });

  it("leaves a GraphQL validation error byte-identical", () => {
    const message = 'graphql: Cannot query field "nosuchfield" on type "Bean".';
    expect(redactPaths(message)).toBe(message);
  });

  it("leaves a URL intact", () => {
    const message = "see http://example.com/a/b for details";
    expect(redactPaths(message)).toBe(message);
  });

  it("redacts every path in a message with more than one", () => {
    expect(redactPaths("copying /a/one.md to /b/two.md failed")).toBe(
      "copying one.md to two.md failed",
    );
  });

  it("leaves a relative path alone", () => {
    const message = "loading .beans/rel.md failed";
    expect(redactPaths(message)).toBe(message);
  });

  it("redacts a path that starts the message", () => {
    expect(redactPaths("/leading/path/at/start.md is broken")).toBe("start.md is broken");
  });

  it("redacts a path introduced by a colon and space", () => {
    expect(redactPaths("beans path does not exist or is not a directory: /nope/here")).toBe(
      "beans path does not exist or is not a directory: here",
    );
  });

  it("redacts a path wrapped in double quotes", () => {
    expect(redactPaths('"/home/alice/git/p/x.md"')).toBe('"x.md"');
  });

  it("redacts a path wrapped in parentheses", () => {
    expect(redactPaths("(/home/alice/git/p/x.md)")).toBe("(x.md)");
  });

  it("redacts a path wrapped in square brackets", () => {
    expect(redactPaths("[/home/alice/git/p/x.md]")).toBe("[x.md]");
  });

  it("redacts a path introduced by a colon with no space", () => {
    expect(redactPaths("error:/home/alice/git/p/x.md")).toBe("error:x.md");
  });

  it("redacts a path embedded as a JSON string value", () => {
    expect(redactPaths('{"path":"/home/alice/git/p/x.md"}')).toBe('{"path":"x.md"}');
  });

  it("redacts the local-path part of a file:// URI without leaking the directory", () => {
    expect(redactPaths("file:///home/alice/git/p/x.md")).not.toContain("/home/alice");
  });

  it("leaves an http:// URL with a bare host fully intact", () => {
    const message = "see http://host/a/b for details";
    expect(redactPaths(message)).toBe(message);
  });

  it("leaves an https:// URL fully intact", () => {
    const message = "https://example.com/path/to/thing";
    expect(redactPaths(message)).toBe(message);
  });

  it("reduces a trailing-slash path to its last segment instead of an empty string", () => {
    expect(redactPaths("dir /a/b/ missing")).toBe("dir b missing");
  });

  it("stops redacting at a colon inside a directory name", () => {
    expect(redactPaths("/home/a/we:ird/x.md")).toBe("we:ird/x.md");
  });

  it("leaves a bare slash between words alone", () => {
    const message = "true / false";
    expect(redactPaths(message)).toBe(message);
  });

  it("leaves a bare slash used as a fraction separator alone", () => {
    const message = "ratio is 10 / 20 percent";
    expect(redactPaths(message)).toBe(message);
  });

  it("leaves a trailing bare slash alone", () => {
    const message = "cannot write to /";
    expect(redactPaths(message)).toBe(message);
  });

  it("leaves multiple bare slashes alone", () => {
    const message = "x / y / z all bare slashes";
    expect(redactPaths(message)).toBe(message);
  });

  it("leaves a doubled bare slash alone", () => {
    const message = "a // b";
    expect(redactPaths(message)).toBe(message);
  });

  it("leaves a slash-delimited word pair alone", () => {
    const message = "and / or";
    expect(redactPaths(message)).toBe(message);
  });
});

// These drive redaction through the real execFile -> extractBeansErrorMessage
// -> BeansError path (unlike the block above, which calls redactPaths
// directly) so the wiring itself is under regression: removing the
// redactPaths calls in extractBeansErrorMessage fails the first test here.
describe("runBeansGraphql error redaction (end-to-end)", () => {
  it("redacts an absolute path surfaced through a real ERROR_LINE-matching stderr", async () => {
    mockError = Object.assign(new Error("ignored — stderr wins"), {
      stderr:
        "Error: loading beans: loading /home/alice/git/proj/.beans/broken.md: parsing front matter\n",
    });

    const err = await runBeansGraphql({
      configPath: "/x/.beans.yml",
      root: ROOT,
      beansPath: "/x/.beans",
      query: "{ beans { id } }",
    }).catch((e: unknown) => e);

    if (!(err instanceof BeansError)) throw new Error("expected a BeansError");
    expect(err.messages[0]).toBe("loading beans: loading broken.md: parsing front matter");
  });

  it("falls back to String(err) — and still redacts it — when err has no stderr or string message", async () => {
    mockError = { stderr: "no error-line prefix here\n" };

    const err = await runBeansGraphql({
      configPath: "/x/.beans.yml",
      root: ROOT,
      beansPath: "/x/.beans",
      query: "{ beans { id } }",
    }).catch((e: unknown) => e);

    if (!(err instanceof BeansError)) throw new Error("expected a BeansError");
    expect(err.message).toBe("[object Object]");
  });
});
