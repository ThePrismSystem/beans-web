import { join } from "node:path";

import type { Analytics, BeanStatus, BeanType, Project } from "@beans-frontend/shared";
import { BEAN_STATUSES, BEAN_TYPES, OPEN_STATUSES } from "@beans-frontend/shared";

import type { RunFn } from "./search.js";

const QUERY = "{ beans { type status updatedAt } }";

// "YYYY-MM" prefix length of an ISO 8601 timestamp
const MONTH_KEY_LENGTH = 7;

export async function buildAnalytics(projects: Project[], run: RunFn): Promise<Analytics> {
  const byType = Object.fromEntries(BEAN_TYPES.map((t) => [t, 0])) as Record<BeanType, number>;
  const byStatus = Object.fromEntries(BEAN_STATUSES.map((s) => [s, 0])) as Record<
    BeanStatus,
    number
  >;
  const months = new Map<string, number>();
  const perProject: Analytics["perProject"] = [];

  await Promise.all(
    projects.map(async (p) => {
      let total = 0;
      let open = 0;
      try {
        const data = (await run(join(p.path, ".beans.yml"), QUERY)) as {
          beans: { type: BeanType; status: BeanStatus; updatedAt: string }[];
        };
        for (const b of data.beans) {
          total += 1;
          byType[b.type] += 1;
          byStatus[b.status] += 1;
          if (OPEN_STATUSES.includes(b.status)) open += 1;
          if (b.status === "completed") {
            const month = b.updatedAt.slice(0, MONTH_KEY_LENGTH);
            months.set(month, (months.get(month) ?? 0) + 1);
          }
        }
      } catch {
        /* skip failed project */
      }
      perProject.push({ project: p.name, total, open });
    }),
  );

  const completedByMonth = [...months.entries()]
    .map(([month, count]) => ({ month, count }))
    .sort((a, b) => a.month.localeCompare(b.month));
  perProject.sort((a, b) => a.project.localeCompare(b.project));
  return { perProject, byType, byStatus, completedByMonth };
}
