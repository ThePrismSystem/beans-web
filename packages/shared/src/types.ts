import type { BeanStatus, BeanType, BeanPriority } from "./enums.js";

/** A bean as it appears in list views — every field except the markdown body. */
export interface BeanListItem {
  id: string;
  slug: string | null;
  path: string;
  title: string;
  status: BeanStatus;
  type: BeanType;
  priority: BeanPriority;
  tags: string[];
  createdAt: string;
  updatedAt: string;
  etag: string;
  parentId: string | null;
  blockingIds: string[];
  blockedByIds: string[];
}

/**
 * A bean including its markdown body. Only the detail view needs `body`;
 * list queries fetch `BeanListItem` so an entire project can be held client
 * side cheaply.
 */
export interface Bean extends BeanListItem {
  body: string;
}

export interface ProjectCounts {
  total: number;
  open: number;
  byType: Record<BeanType, number>;
  byStatus: Record<BeanStatus, number>;
  /** Open beans (status in OPEN_STATUSES) grouped by type — the remaining-work view. */
  openByType: Record<BeanType, number>;
  /** True when the project's beans query failed during discovery; counts are then zeroed and unreliable. */
  error: boolean;
}

/**
 * A project as exposed to clients over the API. Deliberately excludes host
 * filesystem details (absolute `path`, configured `root`); those live only on
 * the server-internal `ProjectRecord` and never reach the wire.
 */
export interface Project {
  name: string;
  prefix: string;
  counts: ProjectCounts;
}

export type ServerEventKind = "add" | "change" | "unlink";

export interface ServerEvent {
  project: string;
  kind: ServerEventKind;
}

export interface Analytics {
  perProject: { project: string; total: number; open: number }[];
  byType: Record<BeanType, number>;
  byStatus: Record<BeanStatus, number>;
  completedByMonth: { month: string; count: number }[];
  /** Names of projects whose beans query failed; their beans are missing from the aggregates. */
  failures: string[];
}

/** A single search match: the bean plus the project it lives in. */
export interface SearchHit {
  project: string;
  bean: Pick<Bean, "id" | "title" | "type" | "status" | "priority">;
}

/** Result of a cross-project search: matches plus the projects that failed to search. */
export interface SearchResult {
  hits: SearchHit[];
  /** Names of projects whose search failed; their potential matches are missing from `hits`. */
  failures: string[];
}

/** A related bean shown in link lists — the minimal shape needed to render a row. */
export type LinkedBean = Pick<BeanListItem, "id" | "title" | "type" | "status">;

/**
 * A bean plus its resolved relationships, as returned by the bean-detail query.
 *
 * beans records a blocking edge on whichever bean's file declared it and never
 * resolves the inverse, so each direction arrives in two halves that must be
 * combined to see the whole relationship:
 *
 * - blocks     = `blockingIds` (this bean's own list) + `blocksInbound`
 * - blocked by = `blockedByIds` (this bean's own list) + `blockedBy`
 */
export interface BeanDetail extends Bean {
  parent: LinkedBean | null;
  children: LinkedBean[];
  /** Beans whose own `blocking` list names this bean, so they block this one. */
  blockedBy: LinkedBean[];
  /** Beans whose own `blocked_by` list names this bean, so this one blocks them. */
  blocksInbound: LinkedBean[];
}
