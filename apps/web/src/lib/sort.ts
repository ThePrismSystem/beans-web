import { BEAN_STATUSES, BEAN_TYPES } from "@beans-frontend/shared";

import type { Bean } from "@beans-frontend/shared";

export type SortKey = "type" | "title" | "status";
export type SortDir = "asc" | "desc";

export function beanComparator(key: SortKey, dir: SortDir): (a: Bean, b: Bean) => number {
  const factor = dir === "desc" ? -1 : 1;
  return (a, b) => {
    if (key === "title") return a.title.localeCompare(b.title) * factor;
    if (key === "type") return (BEAN_TYPES.indexOf(a.type) - BEAN_TYPES.indexOf(b.type)) * factor;
    return (BEAN_STATUSES.indexOf(a.status) - BEAN_STATUSES.indexOf(b.status)) * factor;
  };
}

export function sortBeans(beans: Bean[], key: SortKey, dir: SortDir): Bean[] {
  // Stable copy; never mutate the input array.
  return [...beans].sort(beanComparator(key, dir));
}
