import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useAnalytics } from "./useAnalytics.js";

import type { Analytics } from "@beans-web/shared";
import type { ReactNode } from "react";

afterEach(() => vi.restoreAllMocks());

const analytics: Analytics = {
  perProject: [{ project: "handbellhub", total: 10, open: 4 }],
  byType: { milestone: 1, epic: 2, feature: 3, task: 3, bug: 1 },
  byStatus: { draft: 1, todo: 2, "in-progress": 1, completed: 5, scrapped: 1 },
  completedByMonth: [{ month: "2026-06", count: 5 }],
  failures: [],
};

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

describe("useAnalytics", () => {
  it("fetches and returns the analytics payload", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve(new Response(JSON.stringify(analytics), { status: 200 }))),
    );

    const { result } = renderHook(() => useAnalytics(), { wrapper });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toEqual(analytics);
  });

  // An `AbortSignal` instance rather than merely "something truthy": passing
  // `fetchAnalytics` straight to `queryFn` would hand it the whole
  // QueryFunctionContext as its first argument, which is truthy and useless.
  it("gives the request the query's abort signal", async () => {
    const fetchMock = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(() =>
      Promise.resolve(new Response(JSON.stringify(analytics), { status: 200 })),
    );
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useAnalytics(), { wrapper });
    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    const call = fetchMock.mock.calls[0];
    if (!call) throw new Error("fetch was not called");
    expect(call[1]?.signal).toBeInstanceOf(AbortSignal);
  });
});
