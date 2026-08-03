import { describe, expect, it } from "vitest";

import { BEANS_CONCURRENCY, mapWithConcurrency, withBeansSlot } from "./concurrency.js";

const tick = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 5));

describe("withBeansSlot", () => {
  it("runs at most BEANS_CONCURRENCY callbacks at once across independent calls", async () => {
    let live = 0;
    let peak = 0;

    await Promise.all(
      Array.from({ length: 100 }, () =>
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
