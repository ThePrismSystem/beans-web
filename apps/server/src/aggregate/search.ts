import { join } from "node:path";

import { BEANS_CONCURRENCY, mapWithConcurrency } from "../util/concurrency.js";

import type { ProjectRecord } from "../discovery/scan.js";
import type { SearchHit, SearchResult } from "@beans-frontend/shared";

export type RunFn = (
  configPath: string,
  beansPath: string,
  query: string,
  variables?: Record<string, unknown>,
) => Promise<unknown>;

const QUERY = "query S($q:String!){ beans(filter:{search:$q}){ id title type status priority } }";

export async function globalSearch(
  projects: ProjectRecord[],
  q: string,
  run: RunFn,
): Promise<SearchResult> {
  const failures: string[] = [];
  const perProject = await mapWithConcurrency(projects, BEANS_CONCURRENCY, async (p) => {
    try {
      const data = (await run(join(p.path, ".beans.yml"), p.dataPath, QUERY, { q })) as {
        beans: SearchHit["bean"][];
      };
      return data.beans.map((bean) => ({ project: p.name, bean }));
    } catch (err) {
      failures.push(p.name);
      console.error(`search failed for project ${p.name}:`, err);
      return [] as SearchHit[];
    }
  });
  failures.sort((a, b) => a.localeCompare(b));
  return { hits: perProject.flat(), failures };
}
