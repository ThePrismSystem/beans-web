import { useQuery } from "@tanstack/react-query";

import { fetchProjects } from "../api/client.js";

import type { Project } from "@beans-web/shared";
import type { UseQueryResult } from "@tanstack/react-query";

export function useProjects(): UseQueryResult<Project[]> {
  // Not `queryFn: fetchProjects` — that hands the whole QueryFunctionContext to
  // the first parameter. Destructuring `signal` is also what marks the query as
  // cancellable, so a superseded one stops occupying the server's beans pool.
  return useQuery({ queryKey: ["projects"], queryFn: ({ signal }) => fetchProjects(signal) });
}
