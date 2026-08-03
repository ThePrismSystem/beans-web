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
const waiters: (() => void)[] = [];

async function acquire(): Promise<void> {
  if (active < BEANS_CONCURRENCY) {
    active += 1;
    return;
  }
  // `release` hands its slot straight over, so `active` already counts this
  // caller by the time the promise resolves — deliberately not incremented
  // here. Decrementing and letting the waiter re-acquire would let a caller
  // already queued as a microtask take the freed slot first and push the
  // total past the cap.
  await new Promise<void>((resolve) => waiters.push(resolve));
}

function release(): void {
  const next = waiters.shift();
  if (next) next();
  else active -= 1;
}

/**
 * Runs `fn` holding one of at most `BEANS_CONCURRENCY` process-wide slots,
 * queueing callers FIFO when the pool is full. Every `beans` child is spawned
 * through here, so this bounds the whole server rather than a single request.
 */
export async function withBeansSlot<T>(fn: () => Promise<T>): Promise<T> {
  await acquire();
  try {
    return await fn();
  } finally {
    release();
  }
}
