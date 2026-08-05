import type { ProjectRecord } from "./scan.js";

interface ProjectCache {
  /** Cached projects while the TTL holds, otherwise the shared pass's result. */
  get: () => Promise<ProjectRecord[]>;
  /** Ignores the TTL: joins the pass in flight, or starts one if none is. */
  refresh: () => Promise<ProjectRecord[]>;
}

/**
 * A short-lived cache of one `discoverProjects` pass, with at most one pass in
 * flight at a time whichever caller asked for it.
 *
 * A pass fans out one `beans` child per project, so without the sharing every
 * request arriving on a cold or just-expired cache would start its own, and K
 * concurrent requests would queue K x N children for the same answer. Callers
 * share the in-flight promise instead and the stampede collapses to one pass.
 *
 * `refresh` exists for the periodic re-scan that keeps the watcher's project
 * list current. It goes through the same in-flight promise rather than calling
 * `discover` itself: those two triggers overlap exactly when the cache expires
 * near a tick, and a refresh that scanned on its own doubled the work for that
 * cache generation and raced the request's pass for which result got cached.
 * It skips the TTL check because its whole job is to notice projects created
 * since the last pass, which a cache hit by definition cannot do. It does not
 * evict first either, so requests arriving while it runs are still served from
 * the previous generation instead of blocking on the new pass.
 */
export const createProjectCache = ({
  discover,
  ttlMs,
}: {
  discover: () => Promise<ProjectRecord[]>;
  ttlMs: number;
}): ProjectCache => {
  let cache: { at: number; projects: ProjectRecord[] } | null = null;
  let inFlight: Promise<ProjectRecord[]> | null = null;

  const startPass = (): Promise<ProjectRecord[]> => {
    inFlight ??= discover()
      .then((projects) => {
        cache = { at: Date.now(), projects };
        return projects;
      })
      .finally(() => {
        inFlight = null;
      });
    return inFlight;
  };

  const get = async (): Promise<ProjectRecord[]> => {
    if (cache && Date.now() - cache.at < ttlMs) return cache.projects;
    return startPass();
  };

  return { get, refresh: startPass };
};
