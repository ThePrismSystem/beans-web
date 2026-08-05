import { BEAN_PRIORITIES, BEAN_STATUSES, BEAN_TYPES } from "@beans-web/shared";

import type { BeanListItem } from "@beans-web/shared";

export type SortKey = "type" | "title" | "status";
export type SortDir = "asc" | "desc";

const ID_SUFFIX = /^(.*)-(\d+)$/;

/**
 * Compares bean ids naturally, so `romn-2` precedes `romn-10`. Ids are
 * `prefix-number`; anything that doesn't match falls back to a whole-string
 * compare.
 */
export function compareIds(a: string, b: string): number {
  const matchA = ID_SUFFIX.exec(a);
  const matchB = ID_SUFFIX.exec(b);
  if (!matchA || !matchB) {
    return a.localeCompare(b);
  }
  const [, prefixA = "", numA = ""] = matchA;
  const [, prefixB = "", numB = ""] = matchB;
  const byPrefix = prefixA.localeCompare(prefixB);
  return byPrefix !== 0 ? byPrefix : Number(numA) - Number(numB);
}

/**
 * The `Default` ordering: priority, then type, then natural id. Ids are
 * unique, so this is a total order — it never returns 0 for two distinct
 * beans, which is what stops the list reshuffling when the data refetches.
 */
export function defaultComparator(a: BeanListItem, b: BeanListItem): number {
  const byPriority = BEAN_PRIORITIES.indexOf(a.priority) - BEAN_PRIORITIES.indexOf(b.priority);
  if (byPriority !== 0) {
    return byPriority;
  }
  const byType = BEAN_TYPES.indexOf(a.type) - BEAN_TYPES.indexOf(b.type);
  return byType !== 0 ? byType : compareIds(a.id, b.id);
}

function compareByKey(key: SortKey, a: BeanListItem, b: BeanListItem): number {
  if (key === "title") return a.title.localeCompare(b.title);
  if (key === "type") return BEAN_TYPES.indexOf(a.type) - BEAN_TYPES.indexOf(b.type);
  return BEAN_STATUSES.indexOf(a.status) - BEAN_STATUSES.indexOf(b.status);
}

/**
 * `dir` inverts the primary key only. Ties always resolve through
 * `defaultComparator` ascending, so both directions are fully deterministic.
 */
export function beanComparator(
  key: SortKey,
  dir: SortDir,
): (a: BeanListItem, b: BeanListItem) => number {
  const factor = dir === "desc" ? -1 : 1;
  return (a, b) => {
    const byKey = compareByKey(key, a, b) * factor;
    return byKey !== 0 ? byKey : defaultComparator(a, b);
  };
}

/** Stable copy; never mutates the input array. Omitting `key` applies the default ordering. */
export function sortBeans<T extends BeanListItem>(
  beans: T[],
  key?: SortKey,
  dir: SortDir = "asc",
): T[] {
  return [...beans].sort(key ? beanComparator(key, dir) : defaultComparator);
}
