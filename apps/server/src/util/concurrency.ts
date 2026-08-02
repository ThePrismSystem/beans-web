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
