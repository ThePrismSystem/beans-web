import type { Analytics, ProjectCounts } from "@beans-frontend/shared";
import { BEAN_STATUSES, BEAN_TYPES, zeroCounts } from "@beans-frontend/shared";

import type { ProjectRecord } from "../discovery/scan.js";

function fakeCounts(): ProjectCounts {
  return {
    total: 0,
    open: 0,
    byType: zeroCounts(BEAN_TYPES),
    byStatus: zeroCounts(BEAN_STATUSES),
    openByType: zeroCounts(BEAN_TYPES),
    error: false,
  };
}

export function fakeProject(name: string): ProjectRecord {
  return {
    name,
    path: `/root/${name}`,
    root: "/root",
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
