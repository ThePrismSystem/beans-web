import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { usePersistedProjectState } from "./usePersistedState.js";

afterEach(() => {
  window.localStorage.clear();
});

function readNumber(key: string): number {
  const raw = window.localStorage.getItem(key);
  return raw === null ? 0 : Number(raw);
}

function writeNumber(key: string, value: number): void {
  window.localStorage.setItem(key, String(value));
}

describe("usePersistedProjectState", () => {
  it("seeds state from storage using the beans:<name>:<project> key", () => {
    window.localStorage.setItem("beans:count:demo", "5");

    const { result } = renderHook(() =>
      usePersistedProjectState("demo", "count", readNumber, writeNumber),
    );

    expect(result.current[0]).toBe(5);
  });

  it("defaults to the read function's fallback when storage is empty", () => {
    const { result } = renderHook(() =>
      usePersistedProjectState("demo", "count", readNumber, writeNumber),
    );

    expect(result.current[0]).toBe(0);
  });

  it("persists a plain value update", () => {
    const { result } = renderHook(() =>
      usePersistedProjectState("demo", "count", readNumber, writeNumber),
    );

    act(() => {
      result.current[1](7);
    });

    expect(result.current[0]).toBe(7);
    expect(window.localStorage.getItem("beans:count:demo")).toBe("7");
  });

  it("persists a functional update computed from the current value", () => {
    window.localStorage.setItem("beans:count:demo", "3");
    const { result } = renderHook(() =>
      usePersistedProjectState("demo", "count", readNumber, writeNumber),
    );

    act(() => {
      result.current[1]((current) => current + 1);
    });

    expect(result.current[0]).toBe(4);
    expect(window.localStorage.getItem("beans:count:demo")).toBe("4");
  });

  it("reloads from storage when the project changes", () => {
    window.localStorage.setItem("beans:count:demo", "1");
    window.localStorage.setItem("beans:count:other", "9");

    const { result, rerender } = renderHook(
      ({ project }) => usePersistedProjectState(project, "count", readNumber, writeNumber),
      { initialProps: { project: "demo" } },
    );
    expect(result.current[0]).toBe(1);

    rerender({ project: "other" });

    expect(result.current[0]).toBe(9);
  });
});
