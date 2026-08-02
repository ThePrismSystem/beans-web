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

describe("env TRUST_PROXY", () => {
  async function withTrustProxy(value: string | undefined): Promise<boolean> {
    const before = process.env.TRUST_PROXY;
    if (value === undefined) delete process.env.TRUST_PROXY;
    else process.env.TRUST_PROXY = value;
    vi.resetModules();
    try {
      const { env } = await import("./env.js");
      return env.TRUST_PROXY;
    } finally {
      if (before === undefined) delete process.env.TRUST_PROXY;
      else process.env.TRUST_PROXY = before;
    }
  }

  it("defaults to false when unset, so a directly exposed server stays strict", async () => {
    await expect(withTrustProxy(undefined)).resolves.toBe(false);
  });

  it("reads true", async () => {
    await expect(withTrustProxy("true")).resolves.toBe(true);
  });

  it("reads the numeric form Compose files commonly use", async () => {
    await expect(withTrustProxy("1")).resolves.toBe(true);
    await expect(withTrustProxy("0")).resolves.toBe(false);
  });

  it("reads false", async () => {
    await expect(withTrustProxy("false")).resolves.toBe(false);
  });

  it("fails fast on an unrecognized value rather than silently staying off", async () => {
    await expect(withTrustProxy("yes")).rejects.toThrow(/invalid environment/i);
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
