import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useMediaQuery } from "./useMediaQuery.js";

class FakeMediaQueryList {
  listeners: ((event: MediaQueryListEvent) => void)[] = [];

  constructor(
    public readonly media: string,
    public matches: boolean,
  ) {}

  addEventListener(_type: "change", listener: (event: MediaQueryListEvent) => void): void {
    this.listeners.push(listener);
  }

  removeEventListener(_type: "change", listener: (event: MediaQueryListEvent) => void): void {
    this.listeners = this.listeners.filter((registered) => registered !== listener);
  }

  emit(matches: boolean): void {
    this.matches = matches;
    for (const listener of this.listeners) {
      listener({ matches } as MediaQueryListEvent);
    }
  }
}

const instances: FakeMediaQueryList[] = [];

function stubMatchMedia(initialMatches: boolean) {
  const matchMediaMock = vi.fn((query: string) => {
    const mql = new FakeMediaQueryList(query, initialMatches);
    instances.push(mql);
    return mql;
  });
  vi.stubGlobal("matchMedia", matchMediaMock);
  return matchMediaMock;
}

afterEach(() => {
  instances.length = 0;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("useMediaQuery", () => {
  it("returns the initial match state for the given query", () => {
    stubMatchMedia(true);

    const { result } = renderHook(() => useMediaQuery("(max-width: 640px)"));

    expect(result.current).toBe(true);
  });

  it("returns false when the query does not match", () => {
    stubMatchMedia(false);

    const { result } = renderHook(() => useMediaQuery("(max-width: 640px)"));

    expect(result.current).toBe(false);
  });

  it("updates when the media query list emits a change event", () => {
    stubMatchMedia(false);

    const { result } = renderHook(() => useMediaQuery("(max-width: 640px)"));
    expect(result.current).toBe(false);

    act(() => {
      instances[0]?.emit(true);
    });

    expect(result.current).toBe(true);
  });

  it("stops listening after unmount", () => {
    stubMatchMedia(false);

    const { unmount } = renderHook(() => useMediaQuery("(max-width: 640px)"));
    const mql = instances[0];
    expect(mql?.listeners).toHaveLength(1);

    unmount();

    expect(mql?.listeners).toHaveLength(0);
  });

  it("queries again when the query string changes", () => {
    const matchMediaMock = stubMatchMedia(false);

    const { rerender } = renderHook(({ query }: { query: string }) => useMediaQuery(query), {
      initialProps: { query: "(max-width: 640px)" },
    });

    rerender({ query: "(max-width: 1024px)" });

    expect(matchMediaMock).toHaveBeenCalledWith("(max-width: 640px)");
    expect(matchMediaMock).toHaveBeenCalledWith("(max-width: 1024px)");
  });
});
