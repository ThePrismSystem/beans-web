import { describe, expect, it, vi } from "vitest";

import {
  BEANS_CONCURRENCY,
  MAX_QUEUED_FOR_SLOT,
  mapWithConcurrency,
  QueueFullError,
  withBeansSlot,
} from "./concurrency.js";

const tick = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 5));

describe("withBeansSlot", () => {
  // Sized to the limiter's whole capacity — BEANS_CONCURRENCY running plus
  // MAX_QUEUED_FOR_SLOT queued — so it pins both bounds at once. It used to
  // fire a flat 100, which only passed while the queue was unbounded; that is
  // the behavior the queue cap deliberately removes.
  it("runs at most BEANS_CONCURRENCY callbacks at once across independent calls", async () => {
    let live = 0;
    let peak = 0;

    await Promise.all(
      Array.from({ length: BEANS_CONCURRENCY + MAX_QUEUED_FOR_SLOT }, () =>
        withBeansSlot(async () => {
          live += 1;
          peak = Math.max(peak, live);
          await tick();
          live -= 1;
        }),
      ),
    );

    expect(peak).toBeLessThanOrEqual(BEANS_CONCURRENCY);
    expect(peak).toBe(BEANS_CONCURRENCY);
  });

  // The naive semaphore (decrement, then resolve a waiter) passes the burst test
  // above but fails this one: a caller already queued as a microtask when a
  // holder releases takes the freed slot before the waiter resumes, so the
  // waiter's own increment pushes the count past the cap.
  it("never exceeds the cap when a fresh caller is queued before a waiter resumes", async () => {
    let live = 0;
    let peak = 0;
    const release: (() => void)[] = [];

    const bump = (): void => {
      live += 1;
      peak = Math.max(peak, live);
    };
    const drop = (): void => {
      live -= 1;
    };

    const holder = (): Promise<void> =>
      withBeansSlot(
        () =>
          new Promise<void>((resolve) => {
            bump();
            release.push(() => {
              drop();
              resolve();
            });
          }),
      );

    const quick = async (): Promise<void> => {
      bump();
      await tick();
      drop();
    };

    const holders = Array.from({ length: BEANS_CONCURRENCY }, holder);
    await tick();

    const waiter = withBeansSlot(quick);
    await tick();

    release[0]?.(); // frees one slot and resolves the waiter
    const fresh = Promise.resolve().then(() => withBeansSlot(quick)); // already queued

    await tick();
    release.slice(1).forEach((resolve) => {
      resolve();
    });
    await Promise.all([...holders, waiter, fresh]);

    expect(peak).toBeLessThanOrEqual(BEANS_CONCURRENCY);
  });

  it("releases the slot when the callback rejects", async () => {
    await expect(withBeansSlot(() => Promise.reject(new Error("boom")))).rejects.toThrow("boom");

    // If the failed call leaked its slot, filling the pool would deadlock.
    let live = 0;
    let peak = 0;
    await Promise.all(
      Array.from({ length: BEANS_CONCURRENCY }, () =>
        withBeansSlot(async () => {
          live += 1;
          peak = Math.max(peak, live);
          await tick();
          live -= 1;
        }),
      ),
    );
    expect(peak).toBe(BEANS_CONCURRENCY);
  });

  it("serves waiters first-in-first-out", async () => {
    const order: number[] = [];
    const release: (() => void)[] = [];

    const holders = Array.from({ length: BEANS_CONCURRENCY }, () =>
      withBeansSlot(() => new Promise<void>((resolve) => release.push(resolve))),
    );
    await tick();

    const waiters = [0, 1, 2].map((i) =>
      withBeansSlot(async () => {
        order.push(i);
        await Promise.resolve();
      }),
    );
    await tick();

    release.forEach((resolve) => {
      resolve();
    });
    await Promise.all([...holders, ...waiters]);

    expect(order).toEqual([0, 1, 2]);
  });

  it("returns the callback's resolved value", async () => {
    await expect(withBeansSlot(() => Promise.resolve("done"))).resolves.toBe("done");
  });
});

describe("mapWithConcurrency", () => {
  it("preserves input order in the result", async () => {
    const result = await mapWithConcurrency([3, 1, 2], 2, async (n) => {
      await new Promise((resolve) => setTimeout(resolve, n));
      return n * 10;
    });
    expect(result).toEqual([30, 10, 20]);
  });

  it("runs at most `limit` callbacks at once", async () => {
    let live = 0;
    let peak = 0;
    await mapWithConcurrency(
      Array.from({ length: 20 }, (_, i) => i),
      3,
      async () => {
        live += 1;
        peak = Math.max(peak, live);
        await tick();
        live -= 1;
      },
    );
    expect(peak).toBeLessThanOrEqual(3);
  });

  it("handles an empty input list", async () => {
    await expect(mapWithConcurrency([], 4, () => Promise.resolve(1))).resolves.toEqual([]);
  });
});

describe("withBeansSlot cancellation", () => {
  it("drops a queued caller when its signal aborts, without running it", async () => {
    const release: (() => void)[] = [];
    const hold = () =>
      withBeansSlot(
        () =>
          new Promise<void>((resolve) => {
            release.push(() => {
              resolve();
            });
          }),
      );

    // Fill every slot so the next caller has to queue.
    const holders = Array.from({ length: BEANS_CONCURRENCY }, () => hold());
    await vi.waitFor(() => {
      expect(release.length).toBe(BEANS_CONCURRENCY);
    });

    const controller = new AbortController();
    let ran = false;
    const queued = withBeansSlot(() => {
      ran = true;
      return Promise.resolve();
    }, controller.signal);

    controller.abort();
    await expect(queued).rejects.toThrow();
    // The point of the fix: it never reached the front and spawned its work.
    expect(ran).toBe(false);

    for (const done of release) done();
    await Promise.all(holders);
  });

  it("refuses immediately when handed an already-aborted signal", async () => {
    let ran = false;
    await expect(
      withBeansSlot(() => {
        ran = true;
        return Promise.resolve();
      }, AbortSignal.abort()),
    ).rejects.toThrow();
    expect(ran).toBe(false);
  });

  // Every GraphQL request now carries a signal, so the ordinary case is a
  // queued caller whose signal never fires. Nothing covered it: the other
  // cancellation tests all abort before their caller reaches the front.
  it("serves a queued caller whose signal never fires, and stops listening once served", async () => {
    const resolvers: (() => void)[] = [];
    const hold = (signal?: AbortSignal) =>
      withBeansSlot(
        () =>
          new Promise<void>((resolve) => {
            resolvers.push(resolve);
          }),
        signal,
      );

    const holders = Array.from({ length: BEANS_CONCURRENCY }, () => hold());
    await vi.waitFor(() => {
      expect(resolvers).toHaveLength(BEANS_CONCURRENCY);
    });

    const controller = new AbortController();
    const signalled = hold(controller.signal);
    let ranBehind = false;
    const behind = withBeansSlot(() => {
      ranBehind = true;
      return Promise.resolve();
    });

    // Free one slot. The signalled caller is first in the queue, so it takes it.
    resolvers.shift()?.();
    await vi.waitFor(() => {
      expect(resolvers).toHaveLength(BEANS_CONCURRENCY);
    });

    // It is running now, not queued, so aborting has to be inert. An abort
    // listener that outlived being served would splice at index -1 and evict
    // whoever is genuinely last in the queue — `behind`, here.
    controller.abort();
    expect(ranBehind).toBe(false);

    resolvers.pop()?.();
    await signalled;
    await vi.waitFor(() => {
      expect(ranBehind).toBe(true);
    });
    await behind;

    for (const resolve of resolvers) resolve();
    await Promise.all(holders);
  });

  // `AbortSignal.reason` is whatever the caller passed — `abort("gone")` is
  // legal and leaves a bare string. Rejecting with that would hand every catch
  // site a non-Error, so it gets normalized.
  it("rejects with an Error even when aborted with a non-Error reason", async () => {
    const release: (() => void)[] = [];
    const holders = Array.from({ length: BEANS_CONCURRENCY }, () =>
      withBeansSlot(
        () =>
          new Promise<void>((resolve) => {
            release.push(() => {
              resolve();
            });
          }),
      ),
    );
    await vi.waitFor(() => {
      expect(release.length).toBe(BEANS_CONCURRENCY);
    });

    const controller = new AbortController();
    const queued = withBeansSlot(() => Promise.resolve(), controller.signal);
    controller.abort("gone");
    await expect(queued).rejects.toThrow(/queued for a beans slot/);

    for (const done of release) done();
    await Promise.all(holders);
  });

  it("gives an aborted waiter's slot to the next in line rather than losing it", async () => {
    const release: (() => void)[] = [];
    const hold = () =>
      withBeansSlot(
        () =>
          new Promise<void>((resolve) => {
            release.push(() => {
              resolve();
            });
          }),
      );
    const holders = Array.from({ length: BEANS_CONCURRENCY }, () => hold());
    await vi.waitFor(() => {
      expect(release.length).toBe(BEANS_CONCURRENCY);
    });

    const controller = new AbortController();
    const abandoned = withBeansSlot(() => Promise.resolve(), controller.signal).catch(
      () => "aborted",
    );
    let servedSecond = false;
    const second = withBeansSlot(() => {
      servedSecond = true;
      return Promise.resolve();
    });

    controller.abort();
    await expect(abandoned).resolves.toBe("aborted");

    // Freeing one slot must serve `second`, not be swallowed by the caller that
    // left the queue — a leaked slot would shrink the pool permanently.
    const first = release.shift();
    first?.();
    await second;
    expect(servedSecond).toBe(true);

    for (const done of release) done();
    await Promise.all(holders);
  });
});

describe("withBeansSlot queue cap", () => {
  /**
   * Fills every slot with callbacks that hang until released. Returns the
   * releases, so a test can leave the pool saturated and then drain it.
   */
  async function saturate(): Promise<(() => void)[]> {
    const release: (() => void)[] = [];
    const holders = Array.from({ length: BEANS_CONCURRENCY }, () =>
      withBeansSlot(
        () =>
          new Promise<void>((resolve) => {
            release.push(resolve);
          }),
      ),
    );
    await vi.waitFor(() => {
      expect(release).toHaveLength(BEANS_CONCURRENCY);
    });
    // Keep the holder promises settled once released, so a test that drains
    // the pool doesn't leave rejections unobserved.
    void Promise.all(holders);
    return release;
  }

  it("serves the last caller under the cap and rejects the one past it with QueueFullError", async () => {
    const release = await saturate();

    // `acquire` enqueues synchronously, so these are all queued by the time
    // the loop returns — no waiting needed to reach the cap exactly.
    const queued = Array.from({ length: MAX_QUEUED_FOR_SLOT - 1 }, () =>
      withBeansSlot(() => Promise.resolve()),
    );
    let servedLastUnderCap = false;
    const lastUnderCap = withBeansSlot(() => {
      servedLastUnderCap = true;
      return Promise.resolve();
    });

    // The queue now holds exactly MAX_QUEUED_FOR_SLOT. One more must not join it.
    let ranPastCap = false;
    await expect(
      withBeansSlot(() => {
        ranPastCap = true;
        return Promise.resolve();
      }),
    ).rejects.toBeInstanceOf(QueueFullError);
    expect(ranPastCap).toBe(false);

    for (const done of release) done();
    await Promise.all([...queued, lastUnderCap]);
    // Rejecting the overflow must not have cost the caller under the cap its turn.
    expect(servedLastUnderCap).toBe(true);
  });

  it("accepts callers again once the queue has drained below the cap", async () => {
    const release = await saturate();
    const queued = Array.from({ length: MAX_QUEUED_FOR_SLOT }, () =>
      withBeansSlot(() => Promise.resolve()),
    );
    await expect(withBeansSlot(() => Promise.resolve())).rejects.toBeInstanceOf(QueueFullError);

    for (const done of release) done();
    await Promise.all(queued);

    // The cap is a ceiling on the queue, not a fuse: a drained server serves again.
    await expect(withBeansSlot(() => Promise.resolve("served"))).resolves.toBe("served");
  });

  it("rejects with an Error, so every catch site upstream can treat it as one", async () => {
    const release = await saturate();
    const queued = Array.from({ length: MAX_QUEUED_FOR_SLOT }, () =>
      withBeansSlot(() => Promise.resolve()),
    );

    await expect(withBeansSlot(() => Promise.resolve())).rejects.toThrow(/queue/i);

    for (const done of release) done();
    await Promise.all(queued);
  });
});

describe("withBeansSlot reentrancy", () => {
  it("throws instead of deadlocking when called from inside a held slot", async () => {
    await expect(
      withBeansSlot(() => withBeansSlot(() => Promise.resolve("inner"))),
    ).rejects.toThrow(/not reentrant/);
  });

  it("releases the outer slot after a reentrant call is refused", async () => {
    await withBeansSlot(() => withBeansSlot(() => Promise.resolve())).catch(() => undefined);
    // If the outer slot leaked, this burst could not reach the full cap.
    let peak = 0;
    let live = 0;
    await Promise.all(
      Array.from({ length: BEANS_CONCURRENCY * 2 }, () =>
        withBeansSlot(async () => {
          live += 1;
          peak = Math.max(peak, live);
          await tick();
          live -= 1;
        }),
      ),
    );
    expect(peak).toBe(BEANS_CONCURRENCY);
  });
});
