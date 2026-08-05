import { QueryClientContext } from "@tanstack/react-query";
import { useContext, useEffect, useState } from "react";

import type { ServerEvent, ServerEventKind } from "@beans-web/shared";
import type { QueryClient } from "@tanstack/react-query";

export interface UseEventsResult {
  lastEvent: ServerEvent | null;
}

/** How long events are collected before one batched invalidation is issued. */
const INVALIDATE_WINDOW_MS = 150;

function isServerEventKind(value: string): value is ServerEventKind {
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
    // One `.beans` write is one event, so anything touching several beans at
    // once — an agent working through a list, `beans archive`, a branch switch
    // — arrives as a burst. Invalidating per event would refetch every project
    // list and re-run the cross-project analytics fan-out (which shells out to
    // the `beans` binary once per project) for each file in that burst.
    // Events inside a window are collected and flushed once instead. This is a
    // trailing throttle rather than a debounce: the first event schedules the
    // flush, so a continuous stream still refreshes every WINDOW ms instead of
    // being starved indefinitely.
    const pendingProjects = new Set<string>();
    let pendingEvent: ServerEvent | null = null;
    let flushTimer: ReturnType<typeof setTimeout> | undefined;

    function flush() {
      flushTimer = undefined;
      for (const project of pendingProjects) {
        void queryClient?.invalidateQueries({ queryKey: ["beans", project] });
        void queryClient?.invalidateQueries({ queryKey: ["bean", project] });
      }
      pendingProjects.clear();
      void queryClient?.invalidateQueries({ queryKey: ["projects"] });
      void queryClient?.invalidateQueries({ queryKey: ["analytics"] });
      setLastEvent(pendingEvent);
    }

    source.onmessage = (event: MessageEvent<string>) => {
      const parsed = parseServerEvent(event.data);
      if (!parsed) {
        // Surface (rather than silently drop) payloads we don't recognize —
        // e.g. after a server-side event-shape change.
        console.warn("useEvents: dropped unrecognized SSE payload", event.data);
        return;
      }
      pendingProjects.add(parsed.project);
      pendingEvent = parsed;
      flushTimer ??= setTimeout(flush, INVALIDATE_WINDOW_MS);
    };

    return () => {
      if (flushTimer) {
        clearTimeout(flushTimer);
      }
      source.close();
    };
  }, [queryClient]);

  return { lastEvent };
}
