import { OPEN_STATUSES } from "@beans-web/shared";

import { beanPrefix } from "./prefix.js";

import type { BeanListItem, BeanPriority, BeanStatus, BeanType } from "@beans-web/shared";

export interface BeanFilterInput {
  type: BeanType[];
  status: BeanStatus[];
  priority: BeanPriority[];
  tags: string[];
  prefix: string[];
  search: string;
}

export const EMPTY_BEAN_FILTER: BeanFilterInput = {
  type: [],
  status: [],
  priority: [],
  tags: [],
  prefix: [],
  search: "",
};

export const DEFAULT_BEAN_FILTER: BeanFilterInput = {
  ...EMPTY_BEAN_FILTER,
  status: [...OPEN_STATUSES],
};

/**
 * Mirrors the beans server-side BeanFilter semantics: an empty facet matches
 * everything (the server treats an absent field the same way), values within a
 * facet are ORed, and facets are ANDed together.
 *
 * `search` is deliberately not applied here. It is Bleve query syntax (fuzzy,
 * wildcard, phrase, boolean, field-scoped) and stays server-side.
 */
export function matchesFilter(bean: BeanListItem, filter: BeanFilterInput): boolean {
  if (filter.type.length > 0 && !filter.type.includes(bean.type)) return false;
  if (filter.status.length > 0 && !filter.status.includes(bean.status)) return false;
  if (filter.priority.length > 0 && !filter.priority.includes(bean.priority)) return false;
  if (filter.tags.length > 0 && !filter.tags.some((tag) => bean.tags.includes(tag))) return false;
  if (filter.prefix.length > 0 && !filter.prefix.includes(beanPrefix(bean.id))) return false;
  return true;
}

export function applyFilter<T extends BeanListItem>(beans: T[], filter: BeanFilterInput): T[] {
  return beans.filter((bean) => matchesFilter(bean, filter));
}
