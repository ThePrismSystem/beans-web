import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useProjects } from "./useProjects.js";

import type { Project } from "@beans-frontend/shared";
import type { ReactNode } from "react";

afterEach(() => vi.restoreAllMocks());

const project: Project = {
  name: "handbellhub",
  path: "/g/handbellhub",
  prefix: "hh-",
  counts: {
    total: 10,
    open: 4,
    byType: { milestone: 0, epic: 0, feature: 0, task: 0, bug: 0 },
    byStatus: { draft: 0, todo: 0, "in-progress": 0, completed: 0, scrapped: 0 },
  },
};

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

describe("useProjects", () => {
  it("fetches and returns the project list", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify([project]), { status: 200 })),
    );

    const { result } = renderHook(() => useProjects(), { wrapper });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toEqual([project]);
  });
});
