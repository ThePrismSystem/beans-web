import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useProjectBeans } from "./useBeans.js";

import type { BeanListItem } from "@beans-frontend/shared";
import type { ReactNode } from "react";

afterEach(() => vi.restoreAllMocks());

const bean: BeanListItem = {
  id: "t-1",
  slug: null,
  path: "",
  title: "Task One",
  status: "todo",
  type: "task",
  priority: "normal",
  tags: [],
  createdAt: "",
  updatedAt: "",
  etag: "",
  parentId: null,
  blockingIds: [],
  blockedByIds: [],
};

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

function mockFetch() {
  return vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(JSON.stringify({ data: { beans: [bean] } }), {
      headers: { "content-type": "application/json" },
    }),
  );
}

function sentBody(fetchMock: ReturnType<typeof mockFetch>): { query: string; variables: unknown } {
  const call = fetchMock.mock.calls[0];
  if (!call) throw new Error("fetch was not called");
  const init = call[1];
  if (!init || typeof init.body !== "string") throw new Error("request body was not a JSON string");
  return JSON.parse(init.body) as { query: string; variables: unknown };
}

describe("useProjectBeans", () => {
  it("sends an empty filter when there is no search text", async () => {
    const fetchMock = mockFetch();
    const { result } = renderHook(() => useProjectBeans("demo", ""), { wrapper });
    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(sentBody(fetchMock).variables).toEqual({ filter: {} });
  });

  it("sends only the trimmed search term when there is one", async () => {
    const fetchMock = mockFetch();
    const { result } = renderHook(() => useProjectBeans("demo", "  login~2  "), { wrapper });
    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(sentBody(fetchMock).variables).toEqual({ filter: { search: "login~2" } });
  });

  it("does not request the bean body", async () => {
    const fetchMock = mockFetch();
    const { result } = renderHook(() => useProjectBeans("demo", ""), { wrapper });
    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(sentBody(fetchMock).query).not.toMatch(/\bbody\b/);
  });

  it("returns the beans from the response", async () => {
    mockFetch();
    const { result } = renderHook(() => useProjectBeans("demo", ""), { wrapper });
    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toEqual([bean]);
  });
});
