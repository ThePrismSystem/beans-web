import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { fakeProject } from "../testing/fixtures.js";

import { createProjectCache } from "./cache.js";

import type { ProjectRecord } from "./scan.js";

const TTL_MS = 1_000;

interface Deferred {
  resolve: (projects: ProjectRecord[]) => void;
  reject: (err: unknown) => void;
}

/**
 * A `discover` stub that starts a pass on call and hands the test control of
 * when — and whether — that pass resolves, so two triggers can be made to
 * overlap deterministically. `started()` is the pass count the invariant is
 * about.
 */
function stubDiscover(): {
  discover: () => Promise<ProjectRecord[]>;
  started: () => number;
  resolveNext: (names: string[]) => void;
  rejectNext: (err: Error) => void;
} {
  const queue: Deferred[] = [];
  let started = 0;
  const next = (): Deferred => {
    const pass = queue.shift();
    if (!pass) throw new Error("no discovery pass in flight to settle");
    return pass;
  };
  return {
    discover: () => {
      started += 1;
      return new Promise<ProjectRecord[]>((resolve, reject) => {
        queue.push({ resolve, reject });
      });
    },
    started: () => started,
    resolveNext: (names) => {
      next().resolve(names.map((name) => fakeProject(name)));
    },
    rejectNext: (err) => {
      next().reject(err);
    },
  };
}

const names = (projects: ProjectRecord[]): string[] => projects.map((p) => p.name);

describe("createProjectCache", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("shares one pass when the refresh timer fires first and a request follows", async () => {
    const stub = stubDiscover();
    const cache = createProjectCache({ discover: stub.discover, ttlMs: TTL_MS });

    const boot = cache.get();
    stub.resolveNext(["a"]);
    await boot;
    vi.advanceTimersByTime(TTL_MS);

    const fromTimer = cache.refresh();
    const fromRequest = cache.get();

    expect(stub.started()).toBe(2);
    stub.resolveNext(["b"]);
    expect(names(await fromTimer)).toEqual(["b"]);
    expect(names(await fromRequest)).toEqual(["b"]);
  });

  it("shares one pass when a request starts first and the refresh timer follows", async () => {
    const stub = stubDiscover();
    const cache = createProjectCache({ discover: stub.discover, ttlMs: TTL_MS });

    const boot = cache.get();
    stub.resolveNext(["a"]);
    await boot;
    vi.advanceTimersByTime(TTL_MS);

    const fromRequest = cache.get();
    const fromTimer = cache.refresh();

    expect(stub.started()).toBe(2);
    stub.resolveNext(["b"]);
    expect(names(await fromRequest)).toEqual(["b"]);
    expect(names(await fromTimer)).toEqual(["b"]);
  });

  it("serves the cached projects inside the TTL without another pass", async () => {
    const stub = stubDiscover();
    const cache = createProjectCache({ discover: stub.discover, ttlMs: TTL_MS });

    const boot = cache.get();
    stub.resolveNext(["a"]);
    await boot;
    vi.advanceTimersByTime(TTL_MS - 1);

    expect(names(await cache.get())).toEqual(["a"]);
    expect(stub.started()).toBe(1);
  });

  it("starts a new pass once the TTL has expired", async () => {
    const stub = stubDiscover();
    const cache = createProjectCache({ discover: stub.discover, ttlMs: TTL_MS });

    const boot = cache.get();
    stub.resolveNext(["a"]);
    await boot;
    vi.advanceTimersByTime(TTL_MS);

    const second = cache.get();
    expect(stub.started()).toBe(2);
    stub.resolveNext(["b"]);
    expect(names(await second)).toEqual(["b"]);
  });

  it("joins a second request to the pass an earlier one already started", async () => {
    const stub = stubDiscover();
    const cache = createProjectCache({ discover: stub.discover, ttlMs: TTL_MS });

    const first = cache.get();
    const second = cache.get();

    expect(stub.started()).toBe(1);
    stub.resolveNext(["a"]);
    expect(names(await first)).toEqual(["a"]);
    expect(names(await second)).toEqual(["a"]);
  });

  it("rejects every caller joined to a failed pass and runs the next one", async () => {
    const stub = stubDiscover();
    const cache = createProjectCache({ discover: stub.discover, ttlMs: TTL_MS });

    const fromRequest = cache.get();
    const fromTimer = cache.refresh();
    stub.rejectNext(new Error("beans exploded"));

    await expect(fromRequest).rejects.toThrow("beans exploded");
    await expect(fromTimer).rejects.toThrow("beans exploded");

    const retry = cache.refresh();
    expect(stub.started()).toBe(2);
    stub.resolveNext(["a"]);
    expect(names(await retry)).toEqual(["a"]);
  });

  it("runs a pass on refresh even when the cache is still fresh", async () => {
    const stub = stubDiscover();
    const cache = createProjectCache({ discover: stub.discover, ttlMs: TTL_MS });

    const boot = cache.get();
    stub.resolveNext(["a"]);
    await boot;

    const forced = cache.refresh();
    expect(stub.started()).toBe(2);
    stub.resolveNext(["b"]);
    expect(names(await forced)).toEqual(["b"]);

    expect(names(await cache.get())).toEqual(["b"]);
    expect(stub.started()).toBe(2);
  });

  it("keeps serving the cached projects while a refresh pass is running", async () => {
    const stub = stubDiscover();
    const cache = createProjectCache({ discover: stub.discover, ttlMs: TTL_MS });

    const boot = cache.get();
    stub.resolveNext(["a"]);
    await boot;

    const forced = cache.refresh();
    expect(names(await cache.get())).toEqual(["a"]);
    expect(stub.started()).toBe(2);

    stub.resolveNext(["b"]);
    await forced;
    expect(names(await cache.get())).toEqual(["b"]);
  });
});
