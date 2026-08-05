import { BEAN_PRIORITIES, BEAN_STATUSES, BEAN_TYPES } from "@beans-web/shared";

import type { SortDir, SortKey } from "./sort.js";
import type { BeanPriority, BeanStatus, BeanType } from "@beans-web/shared";

export const SORT_KEYS: readonly SortKey[] = ["type", "title", "status"];
const SORT_DIRS: readonly SortDir[] = ["asc", "desc"];

export interface ProjectSearch {
  type?: BeanType[];
  status?: BeanStatus[];
  priority?: BeanPriority[];
  tags?: string[];
  prefix?: string[];
  search?: string;
  sort?: SortKey;
  dir?: SortDir;
}

function toStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === "string");
  }
  if (typeof value === "string") {
    return [value];
  }
  return [];
}

function filterKnown<T extends string>(values: string[], known: readonly T[]): T[] {
  const knownStrings: readonly string[] = known;
  return values.filter((value): value is T => knownStrings.includes(value));
}

export function isOneOf<T extends string>(value: unknown, known: readonly T[]): value is T {
  const knownStrings: readonly string[] = known;
  return typeof value === "string" && knownStrings.includes(value);
}

export function validateProjectSearch(search: Record<string, unknown>): ProjectSearch {
  const result: ProjectSearch = {};
  const type = filterKnown(toStringArray(search.type), BEAN_TYPES);
  const status = filterKnown(toStringArray(search.status), BEAN_STATUSES);
  const priority = filterKnown(toStringArray(search.priority), BEAN_PRIORITIES);
  const tags = toStringArray(search.tags);
  const prefix = toStringArray(search.prefix);
  if (type.length > 0) result.type = type;
  if (status.length > 0) result.status = status;
  if (priority.length > 0) result.priority = priority;
  if (tags.length > 0) result.tags = tags;
  if (prefix.length > 0) result.prefix = prefix;
  if (typeof search.search === "string" && search.search.length > 0) {
    result.search = search.search;
  }
  if (isOneOf(search.sort, SORT_KEYS)) {
    result.sort = search.sort;
  }
  if (isOneOf(search.dir, SORT_DIRS)) {
    result.dir = search.dir;
  }
  return result;
}
