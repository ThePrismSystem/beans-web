import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useSearch } from "./useSearch.js";

import type { SearchResult } from "@beans-frontend/shared";
import type { ReactNode } from "react";

afterEach(() => vi.restoreAllMocks());

const searchResult: SearchResult = {
  hits: [
    {
      project: "handbellhub",
      bean: {
        id: "hh-1",
        title: "Ring the bell",
        type: "task",
        status: "todo",
        priority: "normal",
      },
    },
  ],
  failures: [],
};

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

describe("useSearch", () => {
  it("fetches search hits for a non-empty query", async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve(new Response(JSON.stringify(searchResult), { status: 200 })),
    );
    vi.stubGlobal("fetch", fetchMock);

    const { result: hook } = renderHook(() => useSearch("bell"), { wrapper });

    await waitFor(() => {
      expect(hook.current.isSuccess).toBe(true);
    });

    expect(hook.current.data).toEqual(searchResult);
    expect(fetchMock).toHaveBeenCalledWith("/api/search?q=bell", {
      signal: expect.any(AbortSignal),
    });
  });

  // The request the user's last keystroke produces queues behind every request
  // its prefixes started. Unless the superseded ones are cancelled, the server
  // is still working through them when the one that matters arrives.
  it("aborts the in-flight request when a new query supersedes it", async () => {
    const signals: (AbortSignal | null | undefined)[] = [];
    const fetchMock = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(
      (_url, init) => {
        signals.push(init?.signal);
        // Never settles: the request is still in flight when the key changes.
        return new Promise<Response>(() => undefined);
      },
    );
    vi.stubGlobal("fetch", fetchMock);

    const { rerender } = renderHook(({ q }: { q: string }) => useSearch(q), {
      wrapper,
      initialProps: { q: "bel" },
    });
    await waitFor(() => {
      expect(signals).toHaveLength(1);
    });
    expect(signals[0]?.aborted).toBe(false);

    rerender({ q: "bell" });

    await waitFor(() => {
      expect(signals[0]?.aborted).toBe(true);
    });
    expect(signals).toHaveLength(2);
    expect(signals[1]?.aborted).toBe(false);
  });

  it("does not fetch when the query is empty or whitespace", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useSearch("   "), { wrapper });

    expect(result.current.fetchStatus).toBe("idle");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
