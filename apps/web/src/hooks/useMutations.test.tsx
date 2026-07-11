import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  describeMutationError,
  isEtagConflict,
  useAddBlockedBy,
  useAddBlocking,
  useCreateBean,
  useDeleteBean,
  useRemoveBlockedBy,
  useRemoveBlocking,
  useSetParent,
  useUpdateBean,
} from "./useMutations.js";

import type { ReactNode } from "react";

afterEach(() => vi.restoreAllMocks());

function makeWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
  function wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  }
  return { wrapper, invalidateSpy };
}

describe("useSetParent", () => {
  it("sends ifMatch and invalidates bean/beans/projects queries on success", async () => {
    const fetchMock = vi.fn(
      async (_url: string, _init: RequestInit) =>
        new Response(JSON.stringify({ data: { setParent: { id: "t1", etag: "new-etag" } } }), {
          status: 200,
        }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const { wrapper, invalidateSpy } = makeWrapper();

    const { result } = renderHook(() => useSetParent("demo"), { wrapper });

    result.current.mutate({ id: "t1", parentId: "m1", etag: "old-etag" });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const call = fetchMock.mock.calls[0];
    if (!call) throw new Error("fetch was not called");
    const body = JSON.parse(String(call[1]?.body)) as { variables: Record<string, unknown> };
    expect(body.variables).toEqual({ id: "t1", parentId: "m1", ifMatch: "old-etag" });

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["bean", "demo", "t1"] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["beans", "demo"] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["projects"] });
  });

  it("surfaces an etag-conflict message when beans reports a mismatch", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            errors: [{ message: "graphql: etag mismatch: provided old-etag, current is new-etag" }],
          }),
          { status: 200 },
        ),
    );
    vi.stubGlobal("fetch", fetchMock);
    const { wrapper } = makeWrapper();

    const { result } = renderHook(() => useSetParent("demo"), { wrapper });

    result.current.mutate({ id: "t1", parentId: "m1", etag: "old-etag" });

    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(isEtagConflict(result.current.error)).toBe(true);
    expect(describeMutationError(result.current.error)).toBe(
      "This bean changed on disk — reload to see the latest.",
    );
  });
});

describe("useUpdateBean", () => {
  it("merges etag into the input as ifMatch", async () => {
    const fetchMock = vi.fn(
      async (_url: string, _init: RequestInit) =>
        new Response(JSON.stringify({ data: { updateBean: { id: "t1", etag: "new-etag" } } }), {
          status: 200,
        }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const { wrapper } = makeWrapper();

    const { result } = renderHook(() => useUpdateBean("demo"), { wrapper });

    result.current.mutate({ id: "t1", etag: "old-etag", input: { title: "New title" } });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const call = fetchMock.mock.calls[0];
    if (!call) throw new Error("fetch was not called");
    const body = JSON.parse(String(call[1]?.body)) as { variables: Record<string, unknown> };
    expect(body.variables).toEqual({
      id: "t1",
      input: { title: "New title", ifMatch: "old-etag" },
    });
  });

  it("surfaces the raw message for a non-conflict error", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ errors: [{ message: "invalid parent for type task" }] }), {
          status: 200,
        }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const { wrapper } = makeWrapper();

    const { result } = renderHook(() => useUpdateBean("demo"), { wrapper });

    result.current.mutate({ id: "t1", etag: "old-etag", input: { title: "x" } });

    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(isEtagConflict(result.current.error)).toBe(false);
    expect(describeMutationError(result.current.error)).toBe("invalid parent for type task");
  });
});

describe("describeMutationError", () => {
  it("falls back to a generic message for non-Error values", () => {
    expect(describeMutationError("boom")).toBe("Something went wrong.");
    expect(isEtagConflict("boom")).toBe(false);
  });
});

describe("useCreateBean", () => {
  it("sends the input and invalidates beans/projects but not a specific bean", async () => {
    const fetchMock = vi.fn(
      async (_url: string, _init: RequestInit) =>
        new Response(JSON.stringify({ data: { createBean: { id: "t2", etag: "e1" } } }), {
          status: 200,
        }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const { wrapper, invalidateSpy } = makeWrapper();

    const { result } = renderHook(() => useCreateBean("demo"), { wrapper });

    result.current.mutate({ title: "New bean", type: "task" });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const call = fetchMock.mock.calls[0];
    if (!call) throw new Error("fetch was not called");
    const body = JSON.parse(String(call[1]?.body)) as { variables: Record<string, unknown> };
    expect(body.variables).toEqual({ input: { title: "New bean", type: "task" } });

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["beans", "demo"] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["projects"] });
  });
});

describe("useDeleteBean", () => {
  it("deletes without ifMatch and invalidates bean/beans/projects", async () => {
    const fetchMock = vi.fn(
      async (_url: string, _init: RequestInit) =>
        new Response(JSON.stringify({ data: { deleteBean: true } }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const { wrapper, invalidateSpy } = makeWrapper();

    const { result } = renderHook(() => useDeleteBean("demo"), { wrapper });

    result.current.mutate({ id: "t1" });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const call = fetchMock.mock.calls[0];
    if (!call) throw new Error("fetch was not called");
    const body = JSON.parse(String(call[1]?.body)) as { variables: Record<string, unknown> };
    expect(body.variables).toEqual({ id: "t1" });

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["bean", "demo", "t1"] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["beans", "demo"] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["projects"] });
  });
});

describe("link mutations", () => {
  const cases: {
    name: string;
    hook: (project: string) => ReturnType<typeof useAddBlocking>;
    resultKey: "addBlocking" | "removeBlocking" | "addBlockedBy" | "removeBlockedBy";
  }[] = [
    { name: "useAddBlocking", hook: useAddBlocking, resultKey: "addBlocking" },
    { name: "useRemoveBlocking", hook: useRemoveBlocking, resultKey: "removeBlocking" },
    { name: "useAddBlockedBy", hook: useAddBlockedBy, resultKey: "addBlockedBy" },
    { name: "useRemoveBlockedBy", hook: useRemoveBlockedBy, resultKey: "removeBlockedBy" },
  ];

  for (const { name, hook, resultKey } of cases) {
    it(`${name} sends ifMatch and invalidates bean/beans/projects on success`, async () => {
      const fetchMock = vi.fn(
        async (_url: string, _init: RequestInit) =>
          new Response(JSON.stringify({ data: { [resultKey]: { id: "t1", etag: "new-etag" } } }), {
            status: 200,
          }),
      );
      vi.stubGlobal("fetch", fetchMock);
      const { wrapper, invalidateSpy } = makeWrapper();

      const { result } = renderHook(() => hook("demo"), { wrapper });

      result.current.mutate({ id: "t1", targetId: "t2", etag: "old-etag" });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      const call = fetchMock.mock.calls[0];
      if (!call) throw new Error("fetch was not called");
      const body = JSON.parse(String(call[1]?.body)) as { variables: Record<string, unknown> };
      expect(body.variables).toEqual({ id: "t1", targetId: "t2", ifMatch: "old-etag" });

      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["bean", "demo", "t1"] });
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["beans", "demo"] });
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["projects"] });
    });
  }
});
