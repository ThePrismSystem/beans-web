import { useQuery } from "@tanstack/react-query";

import { fetchProjects } from "../api/client.js";

import type { UseQueryResult } from "@tanstack/react-query";
import type { Project } from "@beans-frontend/shared";

export function useProjects(): UseQueryResult<Project[]> {
  return useQuery({ queryKey: ["projects"], queryFn: fetchProjects });
}
