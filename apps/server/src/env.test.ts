import { homedir } from "node:os";
import { resolve } from "node:path";
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

describe("env GIT_ROOT", () => {
  it("defaults to a single-element array of ~/git when unset", async () => {
    const before = process.env.GIT_ROOT;
    delete process.env.GIT_ROOT;
    vi.resetModules();
    const { env } = await import("./env.js");
    expect(env.GIT_ROOT).toEqual([resolve(homedir(), "git")]);
    if (before !== undefined) process.env.GIT_ROOT = before;
  });

  it("parses a comma-separated value into a list of resolved absolute paths", async () => {
    const before = process.env.GIT_ROOT;
    process.env.GIT_ROOT = "/tmp/a, /tmp/b";
    vi.resetModules();
    const { env } = await import("./env.js");
    expect(env.GIT_ROOT).toEqual([resolve("/tmp/a"), resolve("/tmp/b")]);
    if (before === undefined) delete process.env.GIT_ROOT;
    else process.env.GIT_ROOT = before;
  });

  it("drops empty entries from trailing or doubled commas", async () => {
    const before = process.env.GIT_ROOT;
    process.env.GIT_ROOT = "/tmp/a,,/tmp/b,";
    vi.resetModules();
    const { env } = await import("./env.js");
    expect(env.GIT_ROOT).toEqual([resolve("/tmp/a"), resolve("/tmp/b")]);
    if (before === undefined) delete process.env.GIT_ROOT;
    else process.env.GIT_ROOT = before;
  });

  it("fails fast instead of silently yielding zero roots for an all-empty value", async () => {
    const before = process.env.GIT_ROOT;
    process.env.GIT_ROOT = ",,";
    vi.resetModules();
    await expect(import("./env.js")).rejects.toThrow(/invalid environment/i);
    if (before === undefined) delete process.env.GIT_ROOT;
    else process.env.GIT_ROOT = before;
  });
});
