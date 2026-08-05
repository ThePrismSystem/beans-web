import { EventEmitter } from "node:events";

import { describe, expect, it, vi } from "vitest";

import { createApp } from "../app.js";
import { fakeAnalytics, fakeProject } from "../testing/fixtures.js";

import type { AppDeps } from "../app.js";

function deps(overrides: Partial<AppDeps> = {}): AppDeps {
  return {
    roots: ["/root"],
    scanDepth: 4,
    listProjects: vi.fn(() => Promise.resolve([fakeProject("proj-a")])),
    runGraphql: vi.fn(() => Promise.resolve({ beans: [] })),
    search: vi.fn(() => Promise.resolve({ hits: [], failures: [] })),
    analytics: vi.fn(() => Promise.resolve(fakeAnalytics())),
    watcher: new EventEmitter(),
    trustProxy: false,
    allowedHosts: [],
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
// The proxy tests below are about the origin comparison, not the host
// allowlist, so they opt "beans.example.com" (the host a reverse proxy would
// forward) into ALLOWED_HOSTS the way a real operator would, rather than
// having the allowlist middleware intercept them first.
const proxyHostAllowed = { allowedHosts: ["beans.example.com"] };

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

  it("rejects a POST with no Origin header, closing the degrade-open gap", async () => {
    const res = await createApp(deps()).request(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
    });
    expect(res.status).toBe(403);
  });

  it("leaves cross-origin GET reads untouched by the CSRF guard itself", async () => {
    const res = await createApp(deps()).request("/api/projects", {
      headers: { origin: "http://evil.example" },
    });
    expect(res.status).toBe(200);
  });

  it("rejects a multipart content-type whose boundary spells application/json", async () => {
    const res = await createApp(deps()).request(url, {
      method: "POST",
      headers: { "content-type": "multipart/form-data; boundary=application/json" },
      body,
    });
    expect(res.status).toBe(415);
  });

  it("still allows application/json with a charset parameter", async () => {
    const res = await createApp(deps()).request(url, {
      method: "POST",
      headers: { "content-type": "application/json; charset=utf-8", origin: "http://localhost" },
      body,
    });
    expect(res.status).toBe(200);
  });

  it("names TRUST_PROXY in the rejection so a proxied deployment is diagnosable", async () => {
    const res = await createApp(deps(proxyHostAllowed)).request(
      proxiedUrl,
      proxiedPost({ origin: "https://beans.example.com" }),
    );
    const payload = (await res.json()) as { errors: { message: string }[] };
    expect(payload.errors[0]?.message).toMatch(/TRUST_PROXY/);
  });
});

describe("cross-origin guard with TRUST_PROXY off", () => {
  it("ignores X-Forwarded-Proto, so a forged header cannot defeat the guard", async () => {
    const res = await createApp(deps(proxyHostAllowed)).request(
      proxiedUrl,
      proxiedPost({ origin: "https://beans.example.com", "x-forwarded-proto": "https" }),
    );
    expect(res.status).toBe(403);
  });

  it("ignores X-Forwarded-Host, so a forged header cannot defeat the guard", async () => {
    const res = await createApp(deps(proxyHostAllowed)).request(
      proxiedUrl,
      proxiedPost({ origin: "http://evil.example", "x-forwarded-host": "evil.example" }),
    );
    expect(res.status).toBe(403);
  });
});

describe("cross-origin guard with TRUST_PROXY on", () => {
  const proxied = () => createApp(deps({ trustProxy: true, ...proxyHostAllowed }));

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

  it("rejects a POST with no Origin header, closing the degrade-open gap", async () => {
    const res = await proxied().request(proxiedUrl, proxiedPost({}));
    expect(res.status).toBe(403);
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

describe("host allowlist (DNS rebinding)", () => {
  it("blocks the rebinding reproduction: a hostile Host/Origin pair on a state-changing POST", async () => {
    // What a DNS-rebinding attack actually sends: a page whose DNS re-resolved
    // to this server, so Host and Origin agree on the attacker's own name.
    const res = await createApp(deps()).request(
      "http://evil.example:4799/api/projects/proj-a/graphql",
      {
        method: "POST",
        headers: { "content-type": "application/json", origin: "http://evil.example:4799" },
        body,
      },
    );
    expect(res.status).toBe(421);
  });

  it("blocks the same rebinding attack against a GET route, closing the read half", async () => {
    const res = await createApp(deps()).request("http://evil.example:4799/api/projects");
    expect(res.status).toBe(421);
  });

  it.each([
    ["http://localhost:4780/api/projects", "localhost"],
    ["http://127.0.0.1:9999/api/projects", "127.0.0.1"],
    ["http://[::1]:4780/api/projects", "[::1]"],
  ])("accepts the default host %s regardless of port", async (reqUrl) => {
    const res = await createApp(deps()).request(reqUrl);
    expect(res.status).toBe(200);
  });

  it("accepts a host configured via ALLOWED_HOSTS", async () => {
    const res = await createApp(deps({ allowedHosts: ["beans.example.com"] })).request(
      "http://beans.example.com/api/projects",
    );
    expect(res.status).toBe(200);
  });

  it("still rejects a host that is not in ALLOWED_HOSTS", async () => {
    const res = await createApp(deps({ allowedHosts: ["beans.example.com"] })).request(
      "http://other.example.com/api/projects",
    );
    expect(res.status).toBe(421);
  });

  it("names ALLOWED_HOSTS in the rejection so an operator knows what to set", async () => {
    const res = await createApp(deps()).request("http://evil.example/api/projects");
    const payload = (await res.json()) as { errors: { message: string }[] };
    expect(payload.errors[0]?.message).toMatch(/ALLOWED_HOSTS/);
  });

  it("checks the forwarded host under TRUST_PROXY, rejecting it though the connection host is allowed", async () => {
    const res = await createApp(deps({ trustProxy: true })).request(
      "http://localhost/api/projects",
      {
        headers: { "x-forwarded-host": "evil.example" },
      },
    );
    expect(res.status).toBe(421);
  });

  it("fails closed on an unparseable forwarded host rather than falling back to the connection host", async () => {
    const res = await createApp(deps({ trustProxy: true })).request(
      "http://localhost/api/projects",
      {
        headers: { "x-forwarded-host": "not a valid host" },
      },
    );
    expect(res.status).toBe(421);
  });

  it("accepts an allowed forwarded host under TRUST_PROXY even when the connection host is not", async () => {
    const res = await createApp(
      deps({ trustProxy: true, allowedHosts: ["beans.example.com"] }),
    ).request("http://internal.example/api/projects", {
      headers: { "x-forwarded-host": "beans.example.com" },
    });
    expect(res.status).toBe(200);
  });

  it("ignores X-Forwarded-Host when TRUST_PROXY is off, so a forged header cannot defeat the allowlist", async () => {
    const res = await createApp(deps()).request("http://localhost/api/projects", {
      headers: { "x-forwarded-host": "evil.example" },
    });
    expect(res.status).toBe(200);
  });
});
