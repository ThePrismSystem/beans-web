import { useQuery } from "@tanstack/react-query";

import { fetchAnalytics } from "../api/client.js";

import type { Analytics } from "@beans-frontend/shared";
import type { UseQueryResult } from "@tanstack/react-query";

export function useAnalytics(): UseQueryResult<Analytics> {
  // Not `queryFn: fetchAnalytics` — that hands the whole QueryFunctionContext to
  // the first parameter. Destructuring `signal` is also what marks the query as
  // cancellable, so a superseded one stops occupying the server's beans pool.
  return useQuery({ queryKey: ["analytics"], queryFn: ({ signal }) => fetchAnalytics(signal) });
}
