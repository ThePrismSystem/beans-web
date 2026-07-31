import { OPEN_STATUSES } from "@beans-frontend/shared";

import type { BeanListItem, BeanStatus } from "@beans-frontend/shared";

/** A parent in one of these states strands its open children. */
const CLOSED_STATUSES: readonly BeanStatus[] = ["completed", "scrapped"];

export function indexById<T extends BeanListItem>(beans: T[]): Map<string, T> {
  return new Map(beans.map((bean) => [bean.id, bean]));
}

/**
 * True when `bean` is open and its parent exists in the project but is
 * completed or scrapped.
 *
 * `byId` must index the FULL project dataset, never a filtered subset: a
 * parent missing because of a filter is not an orphaning parent, and treating
 * absence as evidence is exactly the bug this replaces.
 */
export function isOrphaned(bean: BeanListItem, byId: ReadonlyMap<string, BeanListItem>): boolean {
  if (!OPEN_STATUSES.includes(bean.status)) return false;
  if (bean.parentId === null) return false;
  const parent = byId.get(bean.parentId);
  return parent !== undefined && CLOSED_STATUSES.includes(parent.status);
}

export function orphanedIds(beans: BeanListItem[]): Set<string> {
  const byId = indexById(beans);
  return new Set(beans.filter((bean) => isOrphaned(bean, byId)).map((bean) => bean.id));
}

/**
 * The chain of consecutively completed/scrapped ancestors above `bean`,
 * nearest first — the beans a "Re-open parent" action must touch to leave
 * `bean` in an open tree. Stops at the first open ancestor, a missing parent,
 * or a revisited id (cycle guard).
 */
export function closedAncestors(
  bean: BeanListItem,
  byId: ReadonlyMap<string, BeanListItem>,
): BeanListItem[] {
  const chain: BeanListItem[] = [];
  const seen = new Set<string>([bean.id]);
  let parentId = bean.parentId;
  while (parentId !== null && !seen.has(parentId)) {
    const parent = byId.get(parentId);
    if (parent === undefined || !CLOSED_STATUSES.includes(parent.status)) break;
    seen.add(parent.id);
    chain.push(parent);
    parentId = parent.parentId;
  }
  return chain;
}
