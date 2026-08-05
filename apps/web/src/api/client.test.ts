import { afterEach, describe, expect, it, vi } from "vitest";

import { fetchAnalytics, fetchProjects, fetchSearch, projectGraphql } from "./client.js";

afterEach(() => vi.restoreAllMocks());

/**
 * A `fetch` spy whose call tuple is typed, so `calls[0][1].signal` is a real
 * `AbortSignal | null | undefined` rather than `never` — an assertion against
 * `never` passes no matter what the code does.
 */
function fetchSpy(body: unknown) {
  const mock = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(() =>
    Promise.resolve(new Response(JSON.stringify(body), { status: 200 })),
  );
  vi.stubGlobal("fetch", mock);
  return mock;
}

function sentSignal(mock: ReturnType<typeof fetchSpy>): AbortSignal | null | undefined {
  const call = mock.mock.calls[0];
  if (!call) throw new Error("fetch was not called");
  return call[1]?.signal;
}

describe("fetchProjects", () => {
  it("throws when the response is not ok", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve(new Response("", { status: 500 }))),
    );

    await expect(fetchProjects()).rejects.toThrow("request failed: 500");
  });
});

describe("projectGraphql", () => {
  it("unwraps data on success", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(
          new Response(JSON.stringify({ data: { bean: { id: "x-1" } } }), { status: 200 }),
        ),
      ),
    );
    const out = await projectGraphql<{ bean: { id: string } }>("proj-a", "{ bean { id } }");
    expect(out).toEqual({ bean: { id: "x-1" } });
  });

  it("throws joined messages on errors", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(
          new Response(JSON.stringify({ errors: [{ message: "bad parent" }] }), { status: 400 }),
        ),
      ),
    );
    await expect(projectGraphql("proj-a", "mutation {}")).rejects.toThrow("bad parent");
  });
});

// Without these, a superseded request is never cancelled, so the server's
// disconnect handling never fires for the app's own traffic and the requests
// keep queueing behind each other.
describe("forwarding the caller's AbortSignal", () => {
  it("fetchProjects passes it to fetch", async () => {
    const mock = fetchSpy([]);
    const controller = new AbortController();

    await fetchProjects(controller.signal);

    expect(sentSignal(mock)).toBe(controller.signal);
  });

  it("fetchSearch passes it to fetch", async () => {
    const mock = fetchSpy({ hits: [], failures: [] });
    const controller = new AbortController();

    await fetchSearch("bell", controller.signal);

    expect(sentSignal(mock)).toBe(controller.signal);
  });

  it("fetchAnalytics passes it to fetch", async () => {
    const mock = fetchSpy({});
    const controller = new AbortController();

    await fetchAnalytics(controller.signal);

    expect(sentSignal(mock)).toBe(controller.signal);
  });

  it("projectGraphql passes it to fetch", async () => {
    const mock = fetchSpy({ data: { bean: { id: "x-1" } } });
    const controller = new AbortController();

    await projectGraphql("proj-a", "{ bean { id } }", undefined, controller.signal);

    expect(sentSignal(mock)).toBe(controller.signal);
  });

  it("projectGraphql sends no signal when the caller has none — a mutation must not be cancellable", async () => {
    const mock = fetchSpy({ data: { updateBean: { id: "x-1" } } });

    await projectGraphql("proj-a", "mutation {}", { id: "x-1" });

    expect(sentSignal(mock)).toBeUndefined();
  });

  it("an aborted signal rejects the request instead of returning a body", async () => {
    const controller = new AbortController();
    vi.stubGlobal("fetch", (_url: string, init?: RequestInit) =>
      init?.signal?.aborted === true
        ? Promise.reject(new DOMException("The operation was aborted.", "AbortError"))
        : Promise.resolve(new Response("[]", { status: 200 })),
    );
    controller.abort();

    await expect(fetchProjects(controller.signal)).rejects.toThrow("aborted");
  });
});
