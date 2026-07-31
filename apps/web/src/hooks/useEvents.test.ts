import { act, renderHook } from "@testing-library/react";
import { QueryClient } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";

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

afterEach(() => {
  instances.length = 0;
  vi.restoreAllMocks();
});

function emit(index: number, event: { project: string; kind: "add" | "change" | "unlink" }) {
  act(() => {
    instances[index]?.onmessage?.({ data: JSON.stringify(event) } as MessageEvent<string>);
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

    expect(spy).toHaveBeenCalledWith({ queryKey: ["beans", "p"] });
    expect(spy).toHaveBeenCalledWith({ queryKey: ["bean", "p"] });
    expect(spy).toHaveBeenCalledWith({ queryKey: ["projects"] });
    expect(spy).toHaveBeenCalledWith({ queryKey: ["analytics"] });
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
    expect(result.current.lastEvent).toEqual({ project: "p", kind: "add" });

    emit(0, { project: "q", kind: "unlink" });
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
