import { describe, expect, it, vi } from "vitest";

import { withoutQuery, writeLog } from "./logging.js";

describe("withoutQuery", () => {
  it("strips a query string from an incoming-request log line", () => {
    expect(withoutQuery("<-- GET /api/search?q=secret%20text")).toBe("<-- GET /api/search");
  });

  it("strips a query string from an outgoing-response log line", () => {
    expect(withoutQuery("--> GET /api/search?q=secret%20text 200 5ms")).toBe(
      "--> GET /api/search 200 5ms",
    );
  });

  it("strips multiple query parameters", () => {
    expect(withoutQuery("--> GET /api/search?q=a&b=c 403 1ms")).toBe("--> GET /api/search 403 1ms");
  });

  it("strips a bare, empty query string", () => {
    expect(withoutQuery("--> GET /api/search? 200 1ms")).toBe("--> GET /api/search 200 1ms");
  });

  it("leaves an incoming-request line with no query string unchanged", () => {
    expect(withoutQuery("<-- POST /api/projects/p/graphql")).toBe(
      "<-- POST /api/projects/p/graphql",
    );
  });

  it("leaves an outgoing-response line with no query string unchanged", () => {
    expect(withoutQuery("--> POST /api/projects/p/graphql 400 2ms")).toBe(
      "--> POST /api/projects/p/graphql 400 2ms",
    );
  });

  it("leaves a path with no query string and no status/timing suffix unchanged", () => {
    expect(withoutQuery("--> GET /api/projects 200 3ms")).toBe("--> GET /api/projects 200 3ms");
  });
});

describe("writeLog", () => {
  it("forwards the message to console.info", () => {
    const log = vi.spyOn(console, "info").mockImplementation(() => undefined);

    writeLog("hello");

    expect(log).toHaveBeenCalledWith("hello");
  });
});
