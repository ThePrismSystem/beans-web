import { join } from "node:path";

import type { Project, SearchHit, SearchResult } from "@beans-frontend/shared";

import { BEANS_CONCURRENCY, mapWithConcurrency } from "../util/concurrency.js";

export type RunFn = (
  configPath: string,
  query: string,
  variables?: Record<string, unknown>,
) => Promise<unknown>;

const QUERY = "query S($q:String!){ beans(filter:{search:$q}){ id title type status priority } }";

export async function globalSearch(
  projects: Project[],
  q: string,
  run: RunFn,
): Promise<SearchResult> {
  const failures: string[] = [];
  const perProject = await mapWithConcurrency(projects, BEANS_CONCURRENCY, async (p) => {
    try {
      const data = (await run(join(p.path, ".beans.yml"), QUERY, { q })) as {
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
