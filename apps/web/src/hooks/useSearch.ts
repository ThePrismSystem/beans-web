import { useQuery } from "@tanstack/react-query";

import { fetchSearch } from "../api/client.js";

import type { SearchResult } from "@beans-frontend/shared";
import type { UseQueryResult } from "@tanstack/react-query";

export function useSearch(query: string): UseQueryResult<SearchResult> {
  const trimmed = query.trim();
  return useQuery({
    queryKey: ["search", trimmed],
    queryFn: () => fetchSearch(trimmed),
    enabled: trimmed.length > 0,
  });
}
