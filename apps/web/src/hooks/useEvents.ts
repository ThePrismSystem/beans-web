import { QueryClientContext } from "@tanstack/react-query";
import { useContext, useEffect, useState } from "react";

import type { QueryClient } from "@tanstack/react-query";
import type { ServerEvent } from "@beans-frontend/shared";

export interface UseEventsResult {
  lastEvent: ServerEvent | null;
}

/**
 * Subscribes to the server's SSE event stream and invalidates the affected
 * query caches so the UI live-updates when `.beans` files change on disk.
 *
 * Accepts an optional `QueryClient` override for testing; defaults to the
 * client from the nearest `QueryClientProvider`.
 */
export function useEvents(client?: QueryClient): UseEventsResult {
  const contextClient = useContext(QueryClientContext);
  const queryClient = client ?? contextClient;
  const [lastEvent, setLastEvent] = useState<ServerEvent | null>(null);

  useEffect(() => {
    if (!queryClient) {
      return;
    }

    const source = new EventSource("/api/events");
    source.onmessage = (event: MessageEvent<string>) => {
      const parsed = JSON.parse(event.data) as ServerEvent;
      setLastEvent(parsed);
      queryClient.invalidateQueries({ queryKey: ["beans", parsed.project] });
      queryClient.invalidateQueries({ queryKey: ["bean", parsed.project] });
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      queryClient.invalidateQueries({ queryKey: ["analytics"] });
    };

    return () => {
      source.close();
    };
  }, [queryClient]);

  return { lastEvent };
}
