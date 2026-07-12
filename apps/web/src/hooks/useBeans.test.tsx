import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { EMPTY_BEAN_FILTER, useBeans } from "./useBeans.js";

import type { Bean } from "@beans-frontend/shared";
import type { ReactNode } from "react";

afterEach(() => vi.restoreAllMocks());

const bean: Bean = {
  id: "t1",
  slug: null,
  path: "",
  title: "Task One",
  status: "todo",
  type: "task",
  priority: "normal",
  tags: [],
  createdAt: "",
  updatedAt: "",
  body: "",
  etag: "",
  parentId: null,
  blockingIds: [],
  blockedByIds: [],
};

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

function sentFilter(
  fetchMock: ReturnType<typeof vi.fn<(url: string, init: RequestInit) => Promise<Response>>>,
): unknown {
  const call = fetchMock.mock.calls[0];
  if (!call) {
    throw new Error("fetch was not called");
  }
  const [, init] = call;
  if (typeof init.body !== "string") {
    throw new Error("request body was not a JSON string");
  }
  const parsed: unknown = JSON.parse(init.body);
  if (
    typeof parsed !== "object" ||
    parsed === null ||
    !("variables" in parsed) ||
    typeof parsed.variables !== "object" ||
    parsed.variables === null ||
    !("filter" in parsed.variables)
  ) {
    throw new Error("request body did not contain variables.filter");
  }
  return parsed.variables.filter;
}

describe("useBeans", () => {
  it("fetches beans for a project with an empty filter", async () => {
    const fetchMock = vi.fn(
      async (_url: string, _init: RequestInit) =>
        new Response(JSON.stringify({ data: { beans: [bean] } }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useBeans("demo", EMPTY_BEAN_FILTER), { wrapper });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toEqual([bean]);
    expect(sentFilter(fetchMock)).toEqual({});
  });

  it("sends type, status, priority, tags, and search filters to the server", async () => {
    const fetchMock = vi.fn(
      async (_url: string, _init: RequestInit) =>
        new Response(JSON.stringify({ data: { beans: [] } }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(
      () =>
        useBeans("demo", {
          type: ["task"],
          status: ["todo"],
          priority: ["high"],
          tags: ["urgent"],
          search: "  login  ",
        }),
      { wrapper },
    );

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(sentFilter(fetchMock)).toEqual({
      type: ["task"],
      status: ["todo"],
      priority: ["high"],
      tags: ["urgent"],
      search: "login",
    });
  });
});
