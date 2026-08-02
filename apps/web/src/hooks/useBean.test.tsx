import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useBean } from "./useBean.js";

import type { BeanDetail } from "@beans-frontend/shared";
import type { ReactNode } from "react";

afterEach(() => vi.restoreAllMocks());

const beanDetail: BeanDetail = {
  id: "t1",
  slug: null,
  path: "",
  title: "Task One",
  status: "todo",
  type: "task",
  priority: "normal",
  tags: [],
  createdAt: "2024-01-01T00:00:00Z",
  updatedAt: "2024-01-02T00:00:00Z",
  body: "# Hello",
  etag: "abc",
  parentId: "m1",
  blockingIds: [],
  blockedByIds: [],
  parent: { id: "m1", title: "Milestone", type: "milestone", status: "todo" },
  children: [],
  blockedBy: [],
  blocksInbound: [],
};

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

describe("useBean", () => {
  it("fetches a bean and its linked relationships", async () => {
    const fetchMock = vi.fn<(url: string, init: RequestInit) => Promise<Response>>(() =>
      Promise.resolve(
        new Response(JSON.stringify({ data: { bean: beanDetail, blocksInbound: [] } }), {
          status: 200,
        }),
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useBean("demo", "t1"), { wrapper });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toEqual(beanDetail);
    const call = fetchMock.mock.calls[0];
    if (!call) {
      throw new Error("fetch was not called");
    }
    expect(call[0]).toBe("/api/projects/demo/graphql");
  });

  it("folds the sibling blocksInbound result onto the bean and asks for both id variables", async () => {
    const inbound = [
      { id: "i1", title: "Declares it is blocked by me", type: "task", status: "todo" },
    ];
    const fetchMock = vi.fn<(url: string, init: RequestInit) => Promise<Response>>(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            data: { bean: { ...beanDetail, blocksInbound: undefined }, blocksInbound: inbound },
          }),
          { status: 200 },
        ),
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useBean("demo", "t1"), { wrapper });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data?.blocksInbound).toEqual(inbound);
    const rawBody = fetchMock.mock.calls[0]?.[1]?.body;
    if (typeof rawBody !== "string") {
      throw new Error("expected a string request body");
    }
    const body = JSON.parse(rawBody) as {
      variables: Record<string, unknown>;
    };
    expect(body.variables).toMatchObject({ id: "t1", idStr: "t1" });
  });

  it("errors when the bean is not found", async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve(new Response(JSON.stringify({ data: { bean: null } }), { status: 200 })),
    );
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useBean("demo", "missing"), { wrapper });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });
  });
});
