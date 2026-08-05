import type { Analytics, Project, SearchResult } from "@beans-frontend/shared";

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) throw new Error(`request failed: ${String(res.status)}`);
  return (await res.json()) as T;
}

export async function fetchProjects(signal?: AbortSignal): Promise<Project[]> {
  return json<Project[]>(await fetch("/api/projects", { signal }));
}

/**
 * `signal` is optional because this route serves both reads and writes. Reads
 * pass the one TanStack Query hands their `queryFn`; writes pass nothing.
 *
 * A cancelled write cannot corrupt a bean — the server never forwards the
 * signal to the `beans` child (see `beans/executor.ts`), so a disconnect can
 * only abandon work still queued for a slot. What it costs is the edit
 * silently never happening, with nothing surfaced to the user.
 *
 * The type system does not enforce this: `signal` is optional and trailing, so
 * a `mutationFn` that passes one compiles cleanly. The "mutations are not
 * cancellable" tests in `hooks/useMutations.test.tsx` are what hold it.
 */
export async function projectGraphql<T>(
  project: string,
  query: string,
  variables?: Record<string, unknown>,
  signal?: AbortSignal,
): Promise<T> {
  const res = await fetch(`/api/projects/${encodeURIComponent(project)}/graphql`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query, variables }),
    signal,
  });
  const body = (await res.json()) as { data?: T; errors?: { message: string }[] };
  if (body.errors?.length) throw new Error(body.errors.map((e) => e.message).join("; "));
  return body.data as T;
}

export async function fetchSearch(q: string, signal?: AbortSignal): Promise<SearchResult> {
  return json<SearchResult>(await fetch(`/api/search?q=${encodeURIComponent(q)}`, { signal }));
}

export async function fetchAnalytics(signal?: AbortSignal): Promise<Analytics> {
  return json<Analytics>(await fetch("/api/analytics", { signal }));
}
