import { join } from "node:path";

import type { BeanPriority, BeanStatus, BeanType, Project } from "@beans-frontend/shared";

export type RunFn = (
  configPath: string,
  query: string,
  variables?: Record<string, unknown>,
) => Promise<unknown>;

export interface SearchHit {
  project: string;
  bean: { id: string; title: string; type: BeanType; status: BeanStatus; priority: BeanPriority };
}

const QUERY = "query S($q:String!){ beans(filter:{search:$q}){ id title type status priority } }";

export async function globalSearch(
  projects: Project[],
  q: string,
  run: RunFn,
): Promise<SearchHit[]> {
  const results = await Promise.all(
    projects.map(async (p) => {
      try {
        const data = (await run(join(p.path, ".beans.yml"), QUERY, { q })) as {
          beans: SearchHit["bean"][];
        };
        return data.beans.map((bean) => ({ project: p.name, bean }));
      } catch {
        return [];
      }
    }),
  );
  return results.flat();
}
