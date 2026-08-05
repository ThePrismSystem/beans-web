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
 * pass the one TanStack Query hands their `queryFn`; writes pass nothing, so a
 * mutation cannot be cancelled mid-flight and leave a half-written bean behind.
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
