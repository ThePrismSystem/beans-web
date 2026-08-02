import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";
import { createApp } from "../app.js";
import type { AppDeps } from "../app.js";
import { fakeAnalytics, fakeProject } from "../testing/fixtures.js";

function deps(overrides: Partial<AppDeps> = {}): AppDeps {
  return {
    roots: ["/root"],
    scanDepth: 4,
    listProjects: vi.fn(async () => [fakeProject("proj-a")]),
    runGraphql: vi.fn(async () => ({ beans: [] })),
    search: vi.fn(async () => ({ hits: [], failures: [] })),
    analytics: vi.fn(async () => fakeAnalytics()),
    watcher: new EventEmitter(),
    trustProxy: false,
    ...overrides,
  };
}

const url = "/api/projects/proj-a/graphql";
const body = JSON.stringify({ query: "{ beans { id } }" });

// What a TLS-terminating proxy forwards: the browser reached the public HTTPS
// origin, but the container is handed a plain-HTTP request for that host.
const proxiedUrl = "http://beans.example.com/api/projects/proj-a/graphql";
const proxiedPost = (headers: Record<string, string>) => ({
  method: "POST",
  headers: { "content-type": "application/json", ...headers },
  body,
});

describe("cross-origin guard", () => {
  it("rejects a cross-origin POST with 403", async () => {
    const res = await createApp(deps()).request(url, {
      method: "POST",
      headers: { "content-type": "application/json", origin: "http://evil.example" },
      body,
    });
    expect(res.status).toBe(403);
  });

  it("rejects a non-JSON content-type with 415", async () => {
    const res = await createApp(deps()).request(url, {
      method: "POST",
      headers: { "content-type": "text/plain" },
      body,
    });
    expect(res.status).toBe(415);
  });

  it("allows a same-origin JSON POST", async () => {
    const res = await createApp(deps()).request(url, {
      method: "POST",
      headers: { "content-type": "application/json", origin: "http://localhost" },
      body,
    });
    expect(res.status).toBe(200);
  });

  it("allows a POST with no Origin header (non-browser client)", async () => {
    const res = await createApp(deps()).request(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
    });
    expect(res.status).toBe(200);
  });

  it("leaves cross-origin GET reads untouched", async () => {
    const res = await createApp(deps()).request("/api/projects", {
      headers: { origin: "http://evil.example" },
    });
    expect(res.status).toBe(200);
  });

  it("names TRUST_PROXY in the rejection so a proxied deployment is diagnosable", async () => {
    const res = await createApp(deps()).request(
      proxiedUrl,
      proxiedPost({ origin: "https://beans.example.com" }),
    );
    const payload = (await res.json()) as { errors: { message: string }[] };
    expect(payload.errors[0]?.message).toMatch(/TRUST_PROXY/);
  });
});

describe("cross-origin guard with TRUST_PROXY off", () => {
  it("ignores X-Forwarded-Proto, so a forged header cannot defeat the guard", async () => {
    const res = await createApp(deps()).request(
      proxiedUrl,
      proxiedPost({ origin: "https://beans.example.com", "x-forwarded-proto": "https" }),
    );
    expect(res.status).toBe(403);
  });

  it("ignores X-Forwarded-Host, so a forged header cannot defeat the guard", async () => {
    const res = await createApp(deps()).request(
      proxiedUrl,
      proxiedPost({ origin: "http://evil.example", "x-forwarded-host": "evil.example" }),
    );
    expect(res.status).toBe(403);
  });
});

describe("cross-origin guard with TRUST_PROXY on", () => {
  const proxied = () => createApp(deps({ trustProxy: true }));

  it("accepts the HTTPS origin a TLS-terminating proxy forwards", async () => {
    const res = await proxied().request(
      proxiedUrl,
      proxiedPost({ origin: "https://beans.example.com", "x-forwarded-proto": "https" }),
    );
    expect(res.status).toBe(200);
  });

  it("still rejects a genuinely foreign origin", async () => {
    const res = await proxied().request(
      proxiedUrl,
      proxiedPost({ origin: "https://evil.example", "x-forwarded-proto": "https" }),
    );
    expect(res.status).toBe(403);
  });

  it("takes the first hop when a chain of proxies appends to X-Forwarded-Proto", async () => {
    const res = await proxied().request(
      proxiedUrl,
      proxiedPost({ origin: "https://beans.example.com", "x-forwarded-proto": "https, http" }),
    );
    expect(res.status).toBe(200);
  });

  it("trims whitespace around a forwarded value", async () => {
    const res = await proxied().request(
      proxiedUrl,
      proxiedPost({ origin: "https://beans.example.com", "x-forwarded-proto": "  https  " }),
    );
    expect(res.status).toBe(200);
  });

  it("honors X-Forwarded-Host when the proxy rewrites Host to the internal name", async () => {
    const res = await proxied().request(
      "http://beans-frontend:4780/api/projects/proj-a/graphql",
      proxiedPost({
        origin: "https://beans.example.com",
        "x-forwarded-proto": "https",
        "x-forwarded-host": "beans.example.com, internal.example",
      }),
    );
    expect(res.status).toBe(200);
  });

  it("falls back to the request URL when the proxy forwards no headers", async () => {
    const res = await proxied().request(
      proxiedUrl,
      proxiedPost({ origin: "http://beans.example.com" }),
    );
    expect(res.status).toBe(200);
  });

  it("rejects an empty forwarded value rather than building a malformed origin", async () => {
    const res = await proxied().request(
      proxiedUrl,
      proxiedPost({ origin: "://beans.example.com", "x-forwarded-proto": "" }),
    );
    expect(res.status).toBe(403);
  });

  it("allows a POST with no Origin header (non-browser client)", async () => {
    const res = await proxied().request(proxiedUrl, proxiedPost({}));
    expect(res.status).toBe(200);
  });

  it("does not suggest TRUST_PROXY in the rejection when it is already on", async () => {
    const res = await proxied().request(
      proxiedUrl,
      proxiedPost({ origin: "https://evil.example", "x-forwarded-proto": "https" }),
    );
    const payload = (await res.json()) as { errors: { message: string }[] };
    expect(payload.errors[0]?.message).not.toMatch(/TRUST_PROXY/);
  });
});
