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
    const fetchMock = vi.fn(
      async () => new Response(JSON.stringify(searchResult), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const { result: hook } = renderHook(() => useSearch("bell"), { wrapper });

    await waitFor(() => {
      expect(hook.current.isSuccess).toBe(true);
    });

    expect(hook.current.data).toEqual(searchResult);
    expect(fetchMock).toHaveBeenCalledWith("/api/search?q=bell");
  });

  it("does not fetch when the query is empty or whitespace", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useSearch("   "), { wrapper });

    expect(result.current.fetchStatus).toBe("idle");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
