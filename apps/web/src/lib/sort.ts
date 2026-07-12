import { BEAN_STATUSES, BEAN_TYPES } from "@beans-frontend/shared";

import type { Bean } from "@beans-frontend/shared";

export type SortKey = "type" | "title" | "status";
export type SortDir = "asc" | "desc";

export function sortBeans(beans: Bean[], key: SortKey, dir: SortDir): Bean[] {
  const factor = dir === "desc" ? -1 : 1;
  const compare = (a: Bean, b: Bean): number => {
    if (key === "title") return a.title.localeCompare(b.title) * factor;
    if (key === "type") return (BEAN_TYPES.indexOf(a.type) - BEAN_TYPES.indexOf(b.type)) * factor;
    return (BEAN_STATUSES.indexOf(a.status) - BEAN_STATUSES.indexOf(b.status)) * factor;
  };
  // Stable copy; never mutate the input array.
  return [...beans].sort(compare);
}
