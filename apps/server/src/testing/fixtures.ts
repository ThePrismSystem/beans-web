import type { Analytics, Project, ProjectCounts } from "@beans-frontend/shared";
import { BEAN_STATUSES, BEAN_TYPES, zeroCounts } from "@beans-frontend/shared";

function fakeCounts(): ProjectCounts {
  return {
    total: 0,
    open: 0,
    byType: zeroCounts(BEAN_TYPES),
    byStatus: zeroCounts(BEAN_STATUSES),
    error: false,
  };
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
  return {
    perProject: [],
    byType: zeroCounts(BEAN_TYPES),
    byStatus: zeroCounts(BEAN_STATUSES),
    completedByMonth: [],
    failures: [],
  };
}
