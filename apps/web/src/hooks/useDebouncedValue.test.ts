import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useDebouncedValue } from "./useDebouncedValue.js";

describe("useDebouncedValue", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("returns the initial value immediately", () => {
    const { result } = renderHook(() => useDebouncedValue("a", 200));
    expect(result.current).toBe("a");
  });

  // `act` returns a thenable under React 19. Discarding it with `void` drops
  // any warning or rejection it would surface, so these are awaited.
  it("delays updates until the delay elapses, collapsing rapid changes", async () => {
    const { result, rerender } = renderHook(({ v }) => useDebouncedValue(v, 200), {
      initialProps: { v: "a" },
    });

    rerender({ v: "ab" });
    rerender({ v: "abc" });
    expect(result.current).toBe("a");

    await act(async () => {
      vi.advanceTimersByTime(199);
      await Promise.resolve();
    });
    expect(result.current).toBe("a");

    await act(async () => {
      vi.advanceTimersByTime(1);
      await Promise.resolve();
    });
    expect(result.current).toBe("abc");
  });
});
