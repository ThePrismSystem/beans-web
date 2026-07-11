import { QueryClientContext } from "@tanstack/react-query";
import { useContext, useEffect, useState } from "react";

import type { QueryClient } from "@tanstack/react-query";
import type { ServerEvent } from "@beans-frontend/shared";

export interface UseEventsResult {
  lastEvent: ServerEvent | null;
}

function isServerEventKind(value: string): value is ServerEvent["kind"] {
  return value === "add" || value === "change" || value === "unlink";
}

function parseServerEvent(data: string): ServerEvent | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(data);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) {
    return null;
  }
  const candidate = parsed as Record<string, unknown>;
  const { project, kind } = candidate;
  if (typeof project !== "string" || typeof kind !== "string" || !isServerEventKind(kind)) {
    return null;
  }
  return { project, kind };
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
      const parsed = parseServerEvent(event.data);
      if (!parsed) {
        return;
      }
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
