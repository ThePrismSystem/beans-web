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
}

export interface Project {
  name: string;
  path: string;
  prefix: string;
  counts: ProjectCounts;
}

export interface ServerEvent {
  project: string;
  kind: "add" | "change" | "unlink";
}
