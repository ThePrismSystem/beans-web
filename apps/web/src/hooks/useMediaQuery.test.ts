import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useMediaQuery } from "./useMediaQuery.js";

type Listener = () => void;

/** Minimal MediaQueryList stand-in whose `matches` can be driven from a test. */
function stubMatchMedia(initial: boolean) {
  const listeners = new Set<Listener>();
  const list = {
    matches: initial,
    media: "",
    onchange: null,
    addEventListener: (_: string, listener: Listener) => listeners.add(listener),
    removeEventListener: (_: string, listener: Listener) => listeners.delete(listener),
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  };
  // The same object every call, so a later `matches` change is visible to the
  // hook — a spread copy would freeze the value it read at subscribe time.
  vi.stubGlobal(
    "matchMedia",
    vi.fn((query: string) => {
      list.media = query;
      return list;
    }),
  );
  return {
    list,
    set(matches: boolean) {
      list.matches = matches;
      act(() => {
        listeners.forEach((listener) => {
          listener();
        });
      });
    },
    listenerCount: () => listeners.size,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("useMediaQuery", () => {
  it("reports the query's initial state without waiting for an event", () => {
    stubMatchMedia(true);

    const { result } = renderHook(() => useMediaQuery("(max-width: 768px)"));

    expect(result.current).toBe(true);
  });

  it("reports false when the query does not match", () => {
    stubMatchMedia(false);

    const { result } = renderHook(() => useMediaQuery("(max-width: 768px)"));

    expect(result.current).toBe(false);
  });

  it("updates when the query starts matching", () => {
    const media = stubMatchMedia(false);
    const { result } = renderHook(() => useMediaQuery("(max-width: 768px)"));

    media.set(true);

    expect(result.current).toBe(true);
  });

  it("updates when the query stops matching", () => {
    const media = stubMatchMedia(true);
    const { result } = renderHook(() => useMediaQuery("(max-width: 768px)"));

    media.set(false);

    expect(result.current).toBe(false);
  });

  it("detaches its listener on unmount", () => {
    const media = stubMatchMedia(false);
    const { unmount } = renderHook(() => useMediaQuery("(max-width: 768px)"));
    expect(media.listenerCount()).toBe(1);

    unmount();

    expect(media.listenerCount()).toBe(0);
  });
});
