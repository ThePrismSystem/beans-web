import { act, renderHook } from "@testing-library/react";
import { QueryClient } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useEvents } from "./useEvents.js";

class FakeEventSource {
  onmessage: ((event: MessageEvent<string>) => void) | null = null;
  closed = false;

  constructor(public readonly url: string) {
    instances.push(this);
  }

  close(): void {
    this.closed = true;
  }
}

const instances: FakeEventSource[] = [];

/** Comfortably longer than the hook's internal batching window. */
const PAST_WINDOW_MS = 200;

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  instances.length = 0;
  vi.restoreAllMocks();
});

function emit(index: number, event: { project: string; kind: "add" | "change" | "unlink" }) {
  act(() => {
    instances[index]?.onmessage?.({ data: JSON.stringify(event) } as MessageEvent<string>);
  });
}

/** Invalidation is batched, so nothing is issued until the window closes. */
function flushWindow() {
  act(() => {
    vi.advanceTimersByTime(PAST_WINDOW_MS);
  });
}

describe("useEvents", () => {
  it("opens a single EventSource against /api/events", () => {
    vi.stubGlobal("EventSource", FakeEventSource);
    const qc = new QueryClient();

    renderHook(() => useEvents(qc));

    expect(instances).toHaveLength(1);
    expect(instances[0]?.url).toBe("/api/events");
  });

  it("invalidates bean, project, and analytics queries when an event arrives", () => {
    vi.stubGlobal("EventSource", FakeEventSource);
    const qc = new QueryClient();
    const spy = vi.spyOn(qc, "invalidateQueries");

    renderHook(() => useEvents(qc));
    emit(0, { project: "p", kind: "change" });
    flushWindow();

    expect(spy).toHaveBeenCalledWith({ queryKey: ["beans", "p"] });
    expect(spy).toHaveBeenCalledWith({ queryKey: ["bean", "p"] });
    expect(spy).toHaveBeenCalledWith({ queryKey: ["projects"] });
    expect(spy).toHaveBeenCalledWith({ queryKey: ["analytics"] });
  });

  it("holds invalidation until the batching window closes", () => {
    vi.stubGlobal("EventSource", FakeEventSource);
    const qc = new QueryClient();
    const spy = vi.spyOn(qc, "invalidateQueries");

    renderHook(() => useEvents(qc));
    emit(0, { project: "p", kind: "change" });

    expect(spy).not.toHaveBeenCalled();

    flushWindow();
    expect(spy).toHaveBeenCalled();
  });

  it("coalesces a burst into one invalidation per key, keyed by project", () => {
    vi.stubGlobal("EventSource", FakeEventSource);
    const qc = new QueryClient();
    const spy = vi.spyOn(qc, "invalidateQueries");

    renderHook(() => useEvents(qc));
    // A bulk edit: many files, two projects, all inside one window.
    for (let i = 0; i < 10; i += 1) {
      emit(0, { project: "p", kind: "change" });
      emit(0, { project: "q", kind: "change" });
    }
    flushWindow();

    const keys = spy.mock.calls.map(([arg]) => JSON.stringify(arg?.queryKey));
    // Without batching this would be 20 events x 4 keys = 80 invalidations.
    expect(spy).toHaveBeenCalledTimes(6);
    expect(keys.filter((key) => key === JSON.stringify(["analytics"]))).toHaveLength(1);
    expect(keys.filter((key) => key === JSON.stringify(["projects"]))).toHaveLength(1);
    expect(keys).toContain(JSON.stringify(["beans", "p"]));
    expect(keys).toContain(JSON.stringify(["beans", "q"]));
  });

  it("keeps refreshing during an unbroken stream instead of starving", () => {
    vi.stubGlobal("EventSource", FakeEventSource);
    const qc = new QueryClient();
    const spy = vi.spyOn(qc, "invalidateQueries");

    renderHook(() => useEvents(qc));
    // An event every 50ms never leaves a quiet gap, so a debounce would never
    // fire. The trailing throttle still flushes once per window.
    for (let i = 0; i < 12; i += 1) {
      emit(0, { project: "p", kind: "change" });
      act(() => {
        vi.advanceTimersByTime(50);
      });
    }

    expect(spy).toHaveBeenCalled();
  });

  it("ignores a non-JSON payload without throwing or invalidating", () => {
    vi.stubGlobal("EventSource", FakeEventSource);
    const qc = new QueryClient();
    const spy = vi.spyOn(qc, "invalidateQueries");

    const { result } = renderHook(() => useEvents(qc));

    act(() => {
      instances[0]?.onmessage?.({ data: "not json" } as MessageEvent<string>);
    });

    expect(spy).not.toHaveBeenCalled();
    expect(result.current.lastEvent).toBeNull();
  });

  it("ignores a valid-JSON payload of the wrong shape", () => {
    vi.stubGlobal("EventSource", FakeEventSource);
    const qc = new QueryClient();
    const spy = vi.spyOn(qc, "invalidateQueries");

    const { result } = renderHook(() => useEvents(qc));

    act(() => {
      instances[0]?.onmessage?.({ data: JSON.stringify(42) } as MessageEvent<string>);
      instances[0]?.onmessage?.({ data: JSON.stringify({}) } as MessageEvent<string>);
      instances[0]?.onmessage?.({
        data: JSON.stringify({ project: 1, kind: "change" }),
      } as MessageEvent<string>);
      instances[0]?.onmessage?.({
        data: JSON.stringify({ project: "p", kind: "boom" }),
      } as MessageEvent<string>);
    });

    expect(spy).not.toHaveBeenCalled();
    expect(result.current.lastEvent).toBeNull();
  });

  it("tracks the most recent event as lastEvent", () => {
    vi.stubGlobal("EventSource", FakeEventSource);
    const qc = new QueryClient();

    const { result } = renderHook(() => useEvents(qc));
    expect(result.current.lastEvent).toBeNull();

    emit(0, { project: "p", kind: "add" });
    flushWindow();
    expect(result.current.lastEvent).toEqual({ project: "p", kind: "add" });

    emit(0, { project: "q", kind: "unlink" });
    flushWindow();
    expect(result.current.lastEvent).toEqual({ project: "q", kind: "unlink" });
  });

  it("closes the EventSource on unmount", () => {
    vi.stubGlobal("EventSource", FakeEventSource);
    const qc = new QueryClient();

    const { unmount } = renderHook(() => useEvents(qc));
    expect(instances[0]?.closed).toBe(false);

    unmount();
    expect(instances[0]?.closed).toBe(true);
  });

  it("does nothing when no query client is available (no provider, no override)", () => {
    vi.stubGlobal("EventSource", FakeEventSource);

    renderHook(() => useEvents());

    expect(instances).toHaveLength(0);
  });
});
