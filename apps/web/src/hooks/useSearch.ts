import { useQuery } from "@tanstack/react-query";

import { fetchSearch } from "../api/client.js";

import type { UseQueryResult } from "@tanstack/react-query";
import type { SearchResult } from "@beans-frontend/shared";

export function useSearch(query: string): UseQueryResult<SearchResult> {
  const trimmed = query.trim();
  return useQuery({
    queryKey: ["search", trimmed],
    queryFn: () => fetchSearch(trimmed),
    enabled: trimmed.length > 0,
  });
}
