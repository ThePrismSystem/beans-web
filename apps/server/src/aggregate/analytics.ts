import { join } from "node:path";

import { BEAN_STATUSES, BEAN_TYPES, OPEN_STATUSES, zeroCounts } from "@beans-web/shared";

import { BEANS_CONCURRENCY, mapWithConcurrency, QueueFullError } from "../util/concurrency.js";

import type { RunFn } from "./search.js";
import type { ProjectRecord } from "../discovery/scan.js";
import type { Analytics, BeanStatus, BeanType } from "@beans-web/shared";

const QUERY = "{ beans { type status updatedAt } }";

// "YYYY-MM" prefix length of an ISO 8601 timestamp
const MONTH_KEY_LENGTH = 7;

export async function buildAnalytics(
  projects: ProjectRecord[],
  run: RunFn,
  signal?: AbortSignal,
): Promise<Analytics> {
  const byType = zeroCounts(BEAN_TYPES);
  const byStatus = zeroCounts(BEAN_STATUSES);
  const months = new Map<string, number>();
  const perProject: Analytics["perProject"] = [];
  const failures: string[] = [];

  await mapWithConcurrency(projects, BEANS_CONCURRENCY, async (p) => {
    // See globalSearch: once the client is gone, start nothing further.
    signal?.throwIfAborted();
    let total = 0;
    let open = 0;
    try {
      const data = (await run(
        join(p.path, ".beans.yml"),
        p.dataPath,
        p.root,
        QUERY,
        undefined,
        signal,
      )) as {
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
    } catch (err) {
      // See globalSearch: a full queue or a hung-up client is the request's
      // problem, not this project's, so it must not land in `failures`.
      if (err instanceof QueueFullError || signal?.aborted) throw err;
      failures.push(p.name);
      console.error(`analytics failed for project ${p.name}:`, err);
    }
    perProject.push({ project: p.name, total, open });
  });

  const completedByMonth = [...months.entries()]
    .map(([month, count]) => ({ month, count }))
    .sort((a, b) => a.month.localeCompare(b.month));
  perProject.sort((a, b) => a.project.localeCompare(b.project));
  failures.sort((a, b) => a.localeCompare(b));
  return { perProject, byType, byStatus, completedByMonth, failures };
}
