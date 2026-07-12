/** Builds a `Record<K, 0>` from a set of keys — the zeroed starting point for count tallies. */
export function zeroCounts<K extends string>(keys: readonly K[]): Record<K, number> {
  return Object.fromEntries(keys.map((key) => [key, 0])) as Record<K, number>;
}
