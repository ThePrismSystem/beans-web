import { join } from "node:path";

import { BEANS_CONCURRENCY, mapWithConcurrency, QueueFullError } from "../util/concurrency.js";

import type { ProjectRecord } from "../discovery/scan.js";
import type { SearchHit, SearchResult } from "@beans-frontend/shared";

export type RunFn = (
  configPath: string,
  beansPath: string,
  root: string,
  query: string,
  variables?: Record<string, unknown>,
  signal?: AbortSignal,
) => Promise<unknown>;

const QUERY = "query S($q:String!){ beans(filter:{search:$q}){ id title type status priority } }";

export async function globalSearch(
  projects: ProjectRecord[],
  q: string,
  run: RunFn,
  signal?: AbortSignal,
): Promise<SearchResult> {
  const failures: string[] = [];
  const perProject = await mapWithConcurrency(projects, BEANS_CONCURRENCY, async (p) => {
    // The client is already gone: don't start work for the projects still to
    // come. `withBeansSlot` would refuse each of them anyway, but stopping
    // here keeps an abandoned request from touching the limiter N more times,
    // and makes "no new child is spawned once the signal fires" a property of
    // this function rather than of a module two layers down.
    signal?.throwIfAborted();
    try {
      const data = (await run(
        join(p.path, ".beans.yml"),
        p.dataPath,
        p.root,
        QUERY,
        { q },
        signal,
      )) as {
        beans: SearchHit["bean"][];
      };
      return data.beans.map((bean) => ({ project: p.name, bean }));
    } catch (err) {
      // A full queue, or a client that hung up while this project was queued,
      // is a property of the request rather than of the project. Recording
      // either in `failures` would answer 200 with every project listed as
      // broken, and log a line per project for work nobody asked for. Rethrow
      // so the route answers once, for the whole request.
      if (err instanceof QueueFullError || signal?.aborted) throw err;
      failures.push(p.name);
      console.error(`search failed for project ${p.name}:`, err);
      return [] as SearchHit[];
    }
  });
  failures.sort((a, b) => a.localeCompare(b));
  return { hits: perProject.flat(), failures };
}
