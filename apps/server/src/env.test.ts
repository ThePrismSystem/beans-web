import { describe, expect, it, vi } from "vitest";

describe("env SCAN_DEPTH", () => {
  it("defaults SCAN_DEPTH to 1 when unset", async () => {
    const before = process.env.SCAN_DEPTH;
    delete process.env.SCAN_DEPTH;
    vi.resetModules();
    const { env } = await import("./env.js");
    expect(env.SCAN_DEPTH).toBe(1);
    if (before !== undefined) process.env.SCAN_DEPTH = before;
  });
});
