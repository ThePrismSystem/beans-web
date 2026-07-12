import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useAnalytics } from "./useAnalytics.js";

import type { Analytics } from "@beans-frontend/shared";
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
      vi.fn(async () => new Response(JSON.stringify(analytics), { status: 200 })),
    );

    const { result } = renderHook(() => useAnalytics(), { wrapper });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toEqual(analytics);
  });
});
