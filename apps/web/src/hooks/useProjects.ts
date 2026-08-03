import { useQuery } from "@tanstack/react-query";

import { fetchProjects } from "../api/client.js";

import type { Project } from "@beans-frontend/shared";
import type { UseQueryResult } from "@tanstack/react-query";

export function useProjects(): UseQueryResult<Project[]> {
  return useQuery({ queryKey: ["projects"], queryFn: fetchProjects });
}
