import { mkdirSync, mkdtempSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { assertDataPathStillContained, assertWithinRoot, ContainmentError } from "./containment.js";

describe("assertWithinRoot", () => {
  let root: string;
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "containment-"));
  });
  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it("accepts a path inside root", () => {
    expect(assertWithinRoot(root, join(root, "proj-a"))).toBe(join(root, "proj-a"));
  });
  it("accepts the root itself", () => {
    expect(assertWithinRoot(root, root)).toBe(root);
  });
  it("throws on traversal outside root", () => {
    expect(() => assertWithinRoot(root, join(root, "../etc"))).toThrow(/outside/i);
  });
  it("throws a ContainmentError, not a generic Error, on traversal outside root", () => {
    expect(() => assertWithinRoot(root, join(root, "../etc"))).toThrow(ContainmentError);
  });
  it("names the violated root in the error message", () => {
    expect(() => assertWithinRoot(root, join(root, "../etc"))).toThrow(
      new RegExp(root.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
    );
  });
  it("accepts a directory whose name literally starts with ..", () => {
    expect(assertWithinRoot(root, join(root, "..hidden-backup"))).toBe(
      join(root, "..hidden-backup"),
    );
  });
});

describe("assertDataPathStillContained (round-3 TOCTOU re-check)", () => {
  it("resolves for a data path that is still an ordinary directory inside root", async () => {
    const testRoot = mkdtempSync(join(tmpdir(), "scan-toctou-ok-"));
    try {
      const dataPath = join(testRoot, "proj", ".beans");
      mkdirSync(dataPath, { recursive: true });

      await expect(assertDataPathStillContained(testRoot, dataPath)).resolves.toBeUndefined();
    } finally {
      rmSync(testRoot, { recursive: true, force: true });
    }
  });

  it("resolves for a data path that does not exist yet", async () => {
    const testRoot = mkdtempSync(join(tmpdir(), "scan-toctou-missing-"));
    try {
      mkdirSync(join(testRoot, "proj"), { recursive: true });

      await expect(
        assertDataPathStillContained(testRoot, join(testRoot, "proj", ".beans")),
      ).resolves.toBeUndefined();
    } finally {
      rmSync(testRoot, { recursive: true, force: true });
    }
  });

  // Regression lock for the round-3 finding: discovery validates a data
  // directory once and caches the result for its whole cache lifetime
  // (CACHE_TTL_MS/REFRESH_INTERVAL_MS in index.ts). Reproduces exactly what
  // an operator with write access inside root could do in that window -
  // delete the validated directory and replace it with a symlink escaping
  // root - and confirms this function catches it when re-run immediately
  // before use, which is what runBeansGraphql (executor.ts) now does inside
  // its concurrency slot, right before every spawn.
  it("throws once a previously-validated data directory is swapped for a symlink escaping root", async () => {
    const testRoot = mkdtempSync(join(tmpdir(), "scan-toctou-swap-"));
    const outside = mkdtempSync(join(tmpdir(), "scan-toctou-swap-target-"));
    try {
      const dataPath = join(testRoot, "proj", ".beans");
      mkdirSync(dataPath, { recursive: true });

      // Discovery validates it here, while it's still an ordinary directory.
      await expect(assertDataPathStillContained(testRoot, dataPath)).resolves.toBeUndefined();

      // The swap: delete the validated directory, replace the same path
      // with a symlink pointing outside root.
      rmSync(dataPath, { recursive: true, force: true });
      symlinkSync(outside, dataPath);

      await expect(assertDataPathStillContained(testRoot, dataPath)).rejects.toThrow(/outside/i);
    } finally {
      rmSync(testRoot, { recursive: true, force: true });
      rmSync(outside, { recursive: true, force: true });
    }
  });

  // executor.ts distinguishes a containment failure from a generic beans
  // error specifically by type (instanceof ContainmentError), so callers can
  // react to it - routes/graphql.ts maps it to 404 rather than showing a
  // client the raw filesystem message a plain Error would carry.
  it("rejects with a ContainmentError instance, not a generic Error", async () => {
    const testRoot = mkdtempSync(join(tmpdir(), "scan-toctou-type-"));
    try {
      await expect(
        assertDataPathStillContained(testRoot, join(testRoot, "../outside")),
      ).rejects.toBeInstanceOf(ContainmentError);
    } finally {
      rmSync(testRoot, { recursive: true, force: true });
    }
  });
});
