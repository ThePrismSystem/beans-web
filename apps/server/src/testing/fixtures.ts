import type {
  Analytics,
  BeanStatus,
  BeanType,
  Project,
  ProjectCounts,
} from "@beans-frontend/shared";
import { BEAN_STATUSES, BEAN_TYPES } from "@beans-frontend/shared";

export function fakeCounts(): ProjectCounts {
  const byType = Object.fromEntries(BEAN_TYPES.map((t) => [t, 0])) as Record<BeanType, number>;
  const byStatus = Object.fromEntries(BEAN_STATUSES.map((s) => [s, 0])) as Record<
    BeanStatus,
    number
  >;
  return { total: 0, open: 0, byType, byStatus };
}

export function fakeProject(name: string): Project {
  return {
    name,
    path: `/root/${name}`,
    prefix: "x-",
    counts: fakeCounts(),
  };
}

export function fakeAnalytics(): Analytics {
  const byType = Object.fromEntries(BEAN_TYPES.map((t) => [t, 0])) as Record<BeanType, number>;
  const byStatus = Object.fromEntries(BEAN_STATUSES.map((s) => [s, 0])) as Record<
    BeanStatus,
    number
  >;
  return { perProject: [], byType, byStatus, completedByMonth: [] };
}
