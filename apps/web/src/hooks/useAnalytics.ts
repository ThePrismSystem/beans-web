import { useQuery } from "@tanstack/react-query";

import { fetchAnalytics } from "../api/client.js";

import type { UseQueryResult } from "@tanstack/react-query";
import type { Analytics } from "@beans-frontend/shared";

export function useAnalytics(): UseQueryResult<Analytics> {
  return useQuery({ queryKey: ["analytics"], queryFn: fetchAnalytics });
}
