import { realpath } from "node:fs/promises";
import { basename, dirname, join, relative, resolve, sep } from "node:path";

/**
 * Thrown when a path fails containment - lexically, or after symlink
 * resolution - within its configured root. Kept distinct from `BeansError`
 * (`beans/executor.ts`) so a caller can react to a containment failure
 * specifically, rather than have it folded into a generic beans-query error:
 * everything this error's message names is a real filesystem path, meant for
 * an operator log, not a client-facing response.
 */
export class ContainmentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ContainmentError";
  }
}

/**
 * Resolves both to absolute paths and throws `ContainmentError` if
 * `candidate` lexically escapes `root` - a literal `..` segment, before any
 * symlink is even considered. Returns the resolved `candidate` so callers
 * can chain it into further resolution.
 */
export function assertWithinRoot(root: string, candidate: string): string {
  const r = resolve(root);
  const c = resolve(candidate);
  const rel = relative(r, c);
  if (rel === "") return c;
  if (rel.split(sep)[0] === "..") {
    throw new ContainmentError(`path is outside its configured root (${r}): ${candidate}`);
  }
  return c;
}

/**
 * Resolves symlinks in `candidate`, reconstructing the full path even when
 * it — or any ancestor of it — does not exist yet: a project can be
 * configured before its data directory is created. Walks up to the nearest
 * ancestor that does exist, resolves *that*, then re-appends the segments
 * that were stripped off along the way — necessarily symlink-free, since
 * they don't exist yet, so appending them literally is safe. If some
 * existing ancestor is itself a symlink pointing outside the root (e.g. a
 * hostile `sub` directory entry that is a symlink, with a not-yet-created
 * `sub/.beans` underneath), the returned path reflects that escape even
 * though the full candidate path does not exist.
 *
 * Callers must keep this *resolved* result, not the original candidate
 * string, wherever the result is going to be reused later (cached on a
 * `ProjectRecord`, for instance): the candidate is just a path string, and a
 * plain directory today can become a symlink by the time anything acts on
 * that string again.
 */
export async function realpathContained(candidate: string): Promise<string> {
  let current = candidate;
  const tail: string[] = [];
  for (;;) {
    try {
      const real = await realpath(current);
      return tail.length === 0 ? real : join(real, ...tail);
    } catch (err) {
      const e = err as { code?: unknown };
      if (e.code !== "ENOENT") throw err;
      const parent = dirname(current);
      if (parent === current) return join(current, ...tail);
      tail.unshift(basename(current));
      current = parent;
    }
  }
}

/**
 * Re-validates that `dataPath` — already resolved and contained once by
 * discovery's `resolveContainedDataPath` (`discovery/scan.ts`) — is *still*
 * contained within `root` right now.
 *
 * Discovery's result is cached for `dataPath`'s whole cache lifetime
 * (`CACHE_TTL_MS` / `REFRESH_INTERVAL_MS` in `index.ts`). Within that
 * window, an operator with write access inside `root` - the same access
 * SEC-03 already assumes a hostile project can arrive with - could delete
 * the data directory discovery validated and replace it with a symlink
 * pointing outside `root`, then swap it back later. Storing the resolved
 * path instead of the lexical candidate does not close this by itself: at
 * the moment discovery validates an ordinary, not-yet-swapped directory, the
 * resolved and lexical forms are identical, so caching either one is
 * equally vulnerable to a swap that happens strictly *after* that
 * validation.
 *
 * `runBeansGraphql` (`beans/executor.ts`) calls this immediately before
 * spawning the `beans` child, *inside* its concurrency slot rather than
 * before queueing for one. That placement matters: with up to
 * `BEANS_CONCURRENCY` children already running and each bounded only by
 * `BEANS_EXEC_TIMEOUT_MS`, a caller can wait seconds behind the rest of the
 * pool before its turn comes - not the few milliseconds an earlier version
 * of this comment claimed. A check made before the queue would leave that
 * entire wait unguarded. Checking here, only once a slot is actually granted
 * and right before the spawn, narrows the exploitable window to the moment
 * between this call and the child process's own resolution of the same path
 * a moment later. That residual gap cannot be closed from here: only the
 * child process itself avoiding a second path resolution - e.g. by
 * receiving an already-open file descriptor instead of a path string -
 * would close it, which is a materially different, non-portable design not
 * attempted here.
 *
 * Throws `ContainmentError` if containment no longer holds.
 */
export async function assertDataPathStillContained(root: string, dataPath: string): Promise<void> {
  const real = await realpathContained(dataPath);
  assertWithinRoot(root, real);
}
