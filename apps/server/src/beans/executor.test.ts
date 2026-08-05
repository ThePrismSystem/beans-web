import { spawn } from "node:child_process";
import { EventEmitter } from "node:events";

import { afterEach, describe, expect, it, vi } from "vitest";

import { BEANS_CONCURRENCY } from "../util/concurrency.js";

import {
  BEANS_EXEC_TIMEOUT_MS,
  buildBeansArgs,
  BeansError,
  MAX_BEANS_OUTPUT_BYTES,
  parseBeansResult,
  redactPaths,
  runBeansGraphql,
} from "./executor.js";

/**
 * Minimal stand-in for the child's stdin. Only `end(chunk)` and the `error`
 * event are used by the executor, and both matter to a test: `written` is how
 * the query-off-argv assertion checks where the query actually went, and
 * emitting `error` on an EventEmitter with no listener throws synchronously —
 * so the EPIPE test below fails loudly if the executor stops listening.
 */
class FakeStdin extends EventEmitter {
  readonly written: string[] = [];
  ended = false;
  end(chunk?: string): this {
    if (chunk !== undefined) this.written.push(chunk);
    this.ended = true;
    return this;
  }
}

interface Outcome {
  code?: number;
  signal?: string | null;
  stdout?: string;
  stderr?: string;
}

class FakeChild extends EventEmitter {
  readonly stdout = new EventEmitter();
  readonly stderr = new EventEmitter();
  readonly stdin = new FakeStdin();
  readonly killed: string[] = [];
  kill(signal?: string): boolean {
    this.killed.push(signal ?? "SIGTERM");
    return true;
  }
  finish(outcome: Outcome): void {
    if (outcome.stdout !== undefined) this.stdout.emit("data", Buffer.from(outcome.stdout));
    if (outcome.stderr !== undefined) this.stderr.emit("data", Buffer.from(outcome.stderr));
    this.emit("close", outcome.code ?? 0, outcome.signal ?? null);
  }
}

// The default child fails fast with a stderr that has no "Error:" line, which
// is what the error-handling tests want. `holdChildren` switches it to parking
// each child so a test can observe how many are in flight at once, or drive one
// by hand. `defaultOutcome` is settable per test so a test can push a specific
// exit through the real spawn -> extractBeansErrorMessage -> BeansError path
// rather than calling redactPaths directly.
const DEFAULT_OUTCOME = (): Outcome => ({ code: 1, stderr: "no error-line prefix here\n" });

const spawned: FakeChild[] = [];
let holdChildren = false;
let inFlight = 0;
let peakInFlight = 0;
const held: (() => void)[] = [];
let defaultOutcome: Outcome = DEFAULT_OUTCOME();
let onSpawn: (() => void) | null = null;

vi.mock("node:child_process", () => ({
  spawn: vi.fn(() => {
    const child = new FakeChild();
    spawned.push(child);
    inFlight += 1;
    peakInFlight = Math.max(peakInFlight, inFlight);
    const finish = (): void => {
      inFlight -= 1;
      child.finish(defaultOutcome);
    };
    // Deferred, never synchronous: the executor attaches its listeners after
    // spawn() returns, so a child that closed inside the call would close
    // before anything was listening and hang the caller forever.
    if (holdChildren) held.push(finish);
    else queueMicrotask(finish);
    onSpawn?.();
    onSpawn = null;
    return child;
  }),
}));

/** Resolves the first time the executor spawns a child after this is called. */
function nextSpawn(): Promise<void> {
  return new Promise<void>((resolve) => {
    onSpawn = resolve;
  });
}

function lastChild(): FakeChild {
  const child = spawned.at(-1);
  if (child === undefined) throw new Error("expected a spawned child");
  return child;
}

function lastArgs(): readonly string[] {
  const args = vi.mocked(spawn).mock.calls.at(-1)?.[1];
  if (args === undefined) throw new Error("expected spawn to have been called");
  return args;
}

afterEach(() => {
  defaultOutcome = DEFAULT_OUTCOME();
  holdChildren = false;
  held.length = 0;
  spawned.length = 0;
  onSpawn = null;
});

// "/x" doesn't exist on the test machine, and nothing under it is symlinked,
// so the real (unmocked) containment re-check every runBeansGraphql call now
// performs resolves it to itself and finds it contained under root "/x" -
// confirmed directly against node:fs/promises before relying on it here.
// Tests below that care about the check's own behavior mock it explicitly;
// every other test lets it run for real, the same as it will in production.
const ROOT = "/x";

const OPTS = {
  configPath: "/x/.beans.yml",
  root: ROOT,
  beansPath: "/x/.beans",
  query: "{ beans { id } }",
};

describe("buildBeansArgs", () => {
  it("passes config, beans-path and the json flag as separate argv entries (no shell)", () => {
    expect(buildBeansArgs(OPTS)).toEqual([
      "graphql",
      "--json",
      "--config",
      "/x/.beans.yml",
      "--beans-path",
      "/x/.beans",
    ]);
  });

  // SEC-06. The query used to be the last argv entry, behind a "--"
  // separator; it is now written to the child's stdin instead, so it never
  // reaches /proc/<pid>/cmdline. A flag-shaped query is included because that
  // is what the "--" separator existed to defuse: with the query off argv
  // entirely there is no positional left for beans to reinterpret as a flag.
  it("never puts the query in argv, whatever shape it has", () => {
    for (const query of ["{ beans { id } }", "--beans-path=/etc", "-v"]) {
      const args = buildBeansArgs({ ...OPTS, query });
      expect(args).not.toContain(query);
      expect(args).not.toContain("--");
    }
  });

  it("adds -v when variables are provided", () => {
    const args = buildBeansArgs({ ...OPTS, variables: { id: "a" } });
    expect(args).toContain("-v");
    expect(args).toContain(JSON.stringify({ id: "a" }));
  });

  it("places --beans-path before any -v so it is parsed as a flag, not that flag's value", () => {
    const args = buildBeansArgs({ ...OPTS, variables: { id: "a" } });
    const flagIndex = args.indexOf("--beans-path");
    expect(flagIndex).toBeGreaterThan(-1);
    expect(args[flagIndex + 1]).toBe("/x/.beans");
    expect(flagIndex).toBeLessThan(args.indexOf("-v"));
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

// SEC-06. These are the two halves of the finding, asserted together on
// purpose: the first is what this change fixes, the second is what it cannot.
// `beans graphql` v0.4.2 takes the query on stdin but offers no way at all to
// pass variables off argv (-v accepts a literal JSON string; "-", "@file" and
// a bare path are each rejected by its JSON decoder). If a future release adds
// one, the second test here fails and prompts the change.
describe("runBeansGraphql argv exposure (SEC-06)", () => {
  it("writes the query to the child's stdin instead of argv", async () => {
    defaultOutcome = { code: 0, stdout: '{"beans":[]}' };
    const query = "query S($q:String!){ beans(filter:{search:$q}) { id title } }";

    await runBeansGraphql({ ...OPTS, query, variables: { q: "private search text" } });

    expect(lastArgs().join(" ")).not.toContain("beans(filter:");
    const child = lastChild();
    expect(child.stdin.written).toEqual([query]);
    expect(child.stdin.ended).toBe(true);
  });

  it("still exposes the variables in argv - the residual this task does not close", async () => {
    defaultOutcome = { code: 0, stdout: '{"beans":[]}' };

    await runBeansGraphql({ ...OPTS, variables: { q: "private search text" } });

    const args = lastArgs();
    expect(args).toContain("-v");
    expect(args).toContain('{"q":"private search text"}');
  });

  it("omits -v entirely when there are no variables", async () => {
    defaultOutcome = { code: 0, stdout: '{"beans":[]}' };

    await runBeansGraphql(OPTS);

    expect(lastArgs()).not.toContain("-v");
  });
});

// execFile supplied the timeout and the output cap; spawn supplies neither, so
// executor.ts implements both itself. These drive that code through real child
// behavior rather than asserting on an options object the mock would have
// swallowed anyway.
describe("runBeansGraphql child limits", () => {
  it("kills a child that outlives BEANS_EXEC_TIMEOUT_MS and rejects", async () => {
    vi.useFakeTimers();
    holdChildren = true;
    try {
      const spawnHappened = nextSpawn();
      const settled = runBeansGraphql(OPTS).catch((e: unknown) => e);
      await spawnHappened;

      const child = lastChild();
      expect(child.killed).toEqual([]);
      vi.advanceTimersByTime(BEANS_EXEC_TIMEOUT_MS);

      const err = await settled;
      expect(child.killed).toEqual(["SIGKILL"]);
      if (!(err instanceof BeansError)) throw new Error("expected a BeansError");
      expect(err.message).toMatch(/timed out after 15000ms/);
    } finally {
      vi.useRealTimers();
    }
  });

  it("clears the timeout timer when the child exits normally", async () => {
    vi.useFakeTimers();
    try {
      defaultOutcome = { code: 0, stdout: '{"beans":[]}' };
      await runBeansGraphql(OPTS);
      // A timer left pending here would keep the event loop alive for 15s
      // after every single request.
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("clears the timeout timer when the child exits with a failure", async () => {
    vi.useFakeTimers();
    try {
      await runBeansGraphql(OPTS).catch(() => undefined);
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("kills a child that floods stdout past MAX_BEANS_OUTPUT_BYTES and stops reading it", async () => {
    holdChildren = true;
    const spawnHappened = nextSpawn();
    const settled = runBeansGraphql(OPTS).catch((e: unknown) => e);
    await spawnHappened;

    const child = lastChild();
    child.stdout.emit("data", Buffer.alloc(MAX_BEANS_OUTPUT_BYTES + 1));

    const err = await settled;
    expect(child.killed).toEqual(["SIGKILL"]);
    // Detached rather than left accumulating: whatever the dying child has
    // already pushed into the pipe must not keep growing the server's heap.
    expect(child.stdout.listenerCount("data")).toBe(0);
    expect(child.stderr.listenerCount("data")).toBe(0);
    if (!(err instanceof BeansError)) throw new Error("expected a BeansError");
    expect(err.message).toMatch(/exceeded 33554432 bytes/);
  });

  it("counts stdout and stderr against one shared output cap", async () => {
    holdChildren = true;
    const spawnHappened = nextSpawn();
    const settled = runBeansGraphql(OPTS).catch((e: unknown) => e);
    await spawnHappened;

    const child = lastChild();
    const half = Math.ceil((MAX_BEANS_OUTPUT_BYTES + 1) / 2);
    child.stdout.emit("data", Buffer.alloc(half));
    child.stderr.emit("data", Buffer.alloc(half));

    const err = await settled;
    expect(child.killed).toEqual(["SIGKILL"]);
    expect(err).toBeInstanceOf(BeansError);
  });

  it("accepts output that stops exactly at the cap", async () => {
    holdChildren = true;
    const spawnHappened = nextSpawn();
    const settled = runBeansGraphql(OPTS);
    await spawnHappened;

    const child = lastChild();
    const body = '{"beans":[]}';
    child.stdout.emit("data", Buffer.alloc(MAX_BEANS_OUTPUT_BYTES - body.length));
    child.stdout.emit("data", Buffer.from(body));
    child.emit("close", 0, null);

    // The padding is NUL bytes, so this is not parseable JSON - the point is
    // only that the cap did not fire and the child was not killed.
    await settled.catch(() => undefined);
    expect(child.killed).toEqual([]);
  });
});

describe("runBeansGraphql", () => {
  it("resolves the child's stdout parsed as the beans result", async () => {
    defaultOutcome = { code: 0, stdout: '{"beans":[{"id":"a"}]}' };
    await expect(runBeansGraphql(OPTS)).resolves.toEqual({ beans: [{ id: "a" }] });
  });

  it("reports stdout that is not JSON as a BeansError rather than throwing raw", async () => {
    defaultOutcome = { code: 0, stdout: "not json" };
    const err = await runBeansGraphql(OPTS).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(BeansError);
  });

  it("uses the whole stderr as the message when it has no ERROR_LINE prefix", async () => {
    const err = await runBeansGraphql(OPTS).catch((e: unknown) => e);
    if (!(err instanceof BeansError)) throw new Error("expected a BeansError");
    expect(err.message).toBe("no error-line prefix here");
  });

  it("names the exit code and signal when a failing child says nothing at all", async () => {
    defaultOutcome = { code: 2, signal: null };
    const err = await runBeansGraphql(OPTS).catch((e: unknown) => e);
    if (!(err instanceof BeansError)) throw new Error("expected a BeansError");
    expect(err.message).toBe("beans exited (code 2, signal null)");
  });

  it("surfaces a spawn failure (e.g. the binary is missing) as a BeansError", async () => {
    holdChildren = true;
    const spawnHappened = nextSpawn();
    const settled = runBeansGraphql(OPTS).catch((e: unknown) => e);
    await spawnHappened;

    lastChild().emit("error", new Error("spawn beans ENOENT"));

    const err = await settled;
    if (!(err instanceof BeansError)) throw new Error("expected a BeansError");
    expect(err.message).toBe("spawn beans ENOENT");
  });

  // A child that exits before draining its stdin makes the pipe emit EPIPE.
  // Emitting "error" on an EventEmitter with no listener throws synchronously,
  // so this test fails loudly if the executor stops listening - and it asserts
  // that the child's own failure, not the EPIPE, is what the caller sees.
  it("does not let an EPIPE on stdin become the failure the caller sees", async () => {
    holdChildren = true;
    const spawnHappened = nextSpawn();
    const settled = runBeansGraphql(OPTS).catch((e: unknown) => e);
    await spawnHappened;

    const child = lastChild();
    child.stdin.emit("error", Object.assign(new Error("write EPIPE"), { code: "EPIPE" }));
    child.finish({ code: 1, stderr: "Error: graphql: Unexpected <Invalid>\n" });

    const err = await settled;
    if (!(err instanceof BeansError)) throw new Error("expected a BeansError");
    expect(err.message).toBe("graphql: Unexpected <Invalid>");
  });

  // An empty --beans-path makes the CLI fall back to trusting the config
  // file's own beans.path - the exact bypass the --beans-path scheme exists
  // to close. Nothing today passes "" (dataPath always comes from resolve()),
  // but that's an invariant worth asserting rather than leaving unstated.
  // Checked as a plain Error (not a BeansError, and never reaching spawn at
  // all): this is a caller bug, not a beans-side query error to show a client
  // at 400.
  it("rejects with a plain Error and never spawns when beansPath is empty", async () => {
    const callsBefore = vi.mocked(spawn).mock.calls.length;

    const err = await runBeansGraphql({ ...OPTS, beansPath: "" }).then(
      () => {
        throw new Error("expected runBeansGraphql to reject");
      },
      (e: unknown) => e,
    );

    expect(err).toBeInstanceOf(Error);
    expect(err).not.toBeInstanceOf(BeansError);
    expect((err as Error).message).toMatch(/beansPath must not be empty/);
    expect(vi.mocked(spawn).mock.calls.length).toBe(callsBefore);
  });
});

describe("runBeansGraphql concurrency", () => {
  it("never spawns more than BEANS_CONCURRENCY children at once", async () => {
    holdChildren = true;
    inFlight = 0;
    peakInFlight = 0;
    const calls = Array.from({ length: 40 }, () => runBeansGraphql(OPTS).catch(() => undefined));

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

    holdChildren = true;
    try {
      const promise = runBeansGraphql(OPTS).catch(() => undefined);

      // Waiting for the spawn mock to have parked a child is proof the
      // containment check - mocked above to resolve immediately - already
      // ran: runBeansGraphql only reaches spawn after awaiting it.
      await vi.waitFor(() => {
        expect(held.length).toBe(1);
      });
      order.push("spawn");

      held.shift()?.();
      await promise;

      expect(order).toEqual(["containment-check", "spawn"]);
    } finally {
      checkSpy.mockRestore();
    }
  });

  it("propagates a containment failure as-is, without ever spawning", async () => {
    const containment = await import("../util/containment.js");
    const checkSpy = vi
      .spyOn(containment, "assertDataPathStillContained")
      .mockRejectedValue(new containment.ContainmentError("path is outside its configured root"));
    const callsBefore = vi.mocked(spawn).mock.calls.length;

    try {
      const err = await runBeansGraphql(OPTS).then(
        () => {
          throw new Error("expected runBeansGraphql to reject");
        },
        (e: unknown) => e,
      );

      expect(err).toBeInstanceOf(containment.ContainmentError);
      expect(err).not.toBeInstanceOf(BeansError);
      expect(vi.mocked(spawn).mock.calls.length).toBe(callsBefore);
    } finally {
      checkSpy.mockRestore();
    }
  });

  it("checks containment only once a concurrency slot is actually granted, not while merely queued", async () => {
    const containment = await import("../util/containment.js");
    const checkSpy = vi
      .spyOn(containment, "assertDataPathStillContained")
      .mockResolvedValue(undefined);

    holdChildren = true;
    inFlight = 0;
    peakInFlight = 0;
    try {
      const blockers = Array.from({ length: BEANS_CONCURRENCY }, () =>
        runBeansGraphql(OPTS).catch(() => undefined),
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
      const queued = runBeansGraphql(OPTS).catch(() => undefined);
      expect(checkSpy).not.toHaveBeenCalled();

      // Free exactly one slot. FIFO hands it to the queued call, which must
      // run its containment check before it can reach its own spawn.
      held.shift()?.();
      await vi.waitFor(() => {
        expect(checkSpy).toHaveBeenCalledTimes(1);
      });

      // Drain everything else so the test doesn't leak parked children: the
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

// These drive redaction through the real spawn -> extractBeansErrorMessage ->
// BeansError path (unlike the block above, which calls redactPaths directly)
// so the wiring itself is under regression: removing the redactPaths calls in
// extractBeansErrorMessage fails both tests here.
describe("runBeansGraphql error redaction (end-to-end)", () => {
  it("redacts an absolute path surfaced through a real ERROR_LINE-matching stderr", async () => {
    defaultOutcome = {
      code: 1,
      stderr:
        "Error: loading beans: loading /home/alice/git/proj/.beans/broken.md: parsing front matter\n",
    };

    const err = await runBeansGraphql(OPTS).catch((e: unknown) => e);

    if (!(err instanceof BeansError)) throw new Error("expected a BeansError");
    expect(err.messages[0]).toBe("loading beans: loading broken.md: parsing front matter");
  });

  it("redacts a path in stderr that has no ERROR_LINE prefix", async () => {
    defaultOutcome = { code: 1, stderr: "panic: cannot open /home/alice/git/proj/.beans/x.md\n" };

    const err = await runBeansGraphql(OPTS).catch((e: unknown) => e);

    if (!(err instanceof BeansError)) throw new Error("expected a BeansError");
    expect(err.messages[0]).toBe("panic: cannot open x.md");
  });
});
