import { AsyncLocalStorage } from "node:async_hooks";

/**
 * Default cap on concurrent `beans` child processes. Each project queried by
 * discovery/search/analytics spawns one process; without a bound a host with
 * many repos can exhaust file descriptors and process slots.
 */
export const BEANS_CONCURRENCY = 8;

/**
 * Maps over `items` running at most `limit` callbacks at once, preserving input
 * order in the result. Used to bound the fan-out of `beans` child processes.
 */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  const iterator = items.entries();
  async function worker(): Promise<void> {
    for (let entry = iterator.next(); !entry.done; entry = iterator.next()) {
      const [i, item] = entry.value;
      results[i] = await fn(item, i);
    }
  }
  const size = Math.max(1, Math.min(limit, items.length));
  await Promise.all(Array.from({ length: size }, () => worker()));
  return results;
}

/**
 * Slots currently held, and callers queued for one. Module-level on purpose:
 * the cap has to be process-wide. A per-call pool — which is what
 * `mapWithConcurrency`'s `limit` gives you — bounds one request and lets
 * concurrent requests multiply past it without limit.
 */
let active = 0;

interface Waiter {
  resolve: () => void;
}
const waiters: Waiter[] = [];

/**
 * `AbortSignal.reason` is typed `any` and is only a `DOMException` by
 * convention — a caller can abort with anything. Normalize it so the rejection
 * is always an `Error`, which is what every catch site here expects.
 */
function abortError(signal: AbortSignal): Error {
  const reason: unknown = signal.reason;
  return reason instanceof Error ? reason : new Error("aborted while queued for a beans slot");
}

/**
 * Marks the async context of a caller that already holds a slot, so a nested
 * acquire can be rejected instead of deadlocking. With every slot held by
 * callers each waiting on a nested acquire, nothing can ever release.
 */
const holdingSlot = new AsyncLocalStorage<true>();

async function acquire(signal?: AbortSignal): Promise<void> {
  signal?.throwIfAborted();
  if (active < BEANS_CONCURRENCY) {
    active += 1;
    return;
  }
  // `release` hands its slot straight over, so `active` already counts this
  // caller by the time the promise resolves — deliberately not incremented
  // here. Decrementing and letting the waiter re-acquire would let a caller
  // already queued as a microtask take the freed slot first and push the
  // total past the cap.
  // Aliased to a const so the narrowing below survives into the closures; TS
  // resets it for a parameter, which is mutable as far as it is concerned.
  const pending = signal;
  return new Promise<void>((resolve, reject) => {
    const waiter: Waiter = { resolve };
    waiters.push(waiter);
    if (!pending) return;

    const onAbort = (): void => {
      // Being served drops this listener before it resolves, so by the time
      // `onAbort` can run the waiter is always still queued.
      waiters.splice(waiters.indexOf(waiter), 1);
      reject(abortError(pending));
    };
    waiter.resolve = () => {
      pending.removeEventListener("abort", onAbort);
      resolve();
    };
    pending.addEventListener("abort", onAbort, { once: true });
  });
}

function release(): void {
  const next = waiters.shift();
  if (next) next.resolve();
  else active -= 1;
}

/**
 * Runs `fn` holding one of at most `BEANS_CONCURRENCY` process-wide slots,
 * queueing callers FIFO when the pool is full. Every `beans` child is spawned
 * through here, so this bounds the whole server rather than a single request.
 *
 * Pass `signal` to drop out of the queue when the work is no longer wanted —
 * a client that disconnects while queued would otherwise still spawn its child
 * on reaching the front. The signal only cancels *queued* work: once `fn` is
 * running it is left alone, because killing a `beans` child mid-write could
 * leave a bean file half-written.
 *
 * Not reentrant. Calling it from inside `fn` throws rather than deadlocking.
 */
export async function withBeansSlot<T>(fn: () => Promise<T>, signal?: AbortSignal): Promise<T> {
  if (holdingSlot.getStore()) {
    throw new Error(
      "withBeansSlot is not reentrant — a nested acquire would deadlock once every slot is held by a caller waiting on one",
    );
  }
  await acquire(signal);
  try {
    return await holdingSlot.run(true, fn);
  } finally {
    release();
  }
}
