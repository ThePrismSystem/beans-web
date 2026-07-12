import type { BeanStatus, BeanType, BeanPriority } from "./enums.js";

export interface Bean {
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
  body: string;
  etag: string;
  parentId: string | null;
  blockingIds: string[];
  blockedByIds: string[];
}

export interface ProjectCounts {
  total: number;
  open: number;
  byType: Record<BeanType, number>;
  byStatus: Record<BeanStatus, number>;
  /** True when the project's beans query failed during discovery; counts are then zeroed and unreliable. */
  error: boolean;
}

export interface Project {
  name: string;
  path: string;
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
export type LinkedBean = Pick<Bean, "id" | "title" | "type" | "status">;

/** A bean plus its resolved relationships, as returned by the bean-detail query. */
export interface BeanDetail extends Bean {
  parent: LinkedBean | null;
  children: LinkedBean[];
  blocking: LinkedBean[];
  blockedBy: LinkedBean[];
}
