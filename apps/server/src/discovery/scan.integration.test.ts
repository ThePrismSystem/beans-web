import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { discoverProjects } from "./scan.js";

const root = mkdtempSync(join(tmpdir(), "scan-it-"));
const projectDir = join(root, "proj-a");
const brokenDir = join(root, "proj-broken");

beforeAll(() => {
  mkdirSync(projectDir, { recursive: true });
  execFileSync("beans", ["init"], { cwd: projectDir });
  execFileSync("beans", ["create", "Integration seed", "-t", "task"], { cwd: projectDir });

  // Not a real beans project (no `beans init`), so `beans graphql` will fail
  // against it. Used to verify discoverProjects tolerates a failing project
  // instead of crashing the whole scan.
  mkdirSync(brokenDir, { recursive: true });
  writeFileSync(join(brokenDir, ".beans.yml"), "not: a-real-config\n");
});
afterAll(() => rmSync(root, { recursive: true, force: true }));

describe("discoverProjects (real binary)", () => {
  it("finds the seeded project with non-zero counts", async () => {
    const projects = await discoverProjects(root, 4);
    const project = projects.find((p) => p.name === "proj-a");
    expect(project?.path).toBe(projectDir);
    expect(project?.prefix.length).toBeGreaterThan(0);
    expect(project?.counts.total).toBeGreaterThanOrEqual(1);
    expect(project?.counts.error).toBe(false);
    // one seeded open task -> openByType.task >= 1, and open <= total
    expect(project?.counts.openByType.task).toBeGreaterThanOrEqual(1);
  });

  it("zeroes counts and flags the error (does not crash) for a project whose beans query fails", async () => {
    const projects = await discoverProjects(root, 4);
    const broken = projects.find((p) => p.name === "proj-broken");
    expect(broken?.path).toBe(brokenDir);
    expect(broken?.prefix).toBe("");
    expect(broken?.counts.total).toBe(0);
    expect(broken?.counts.open).toBe(0);
    expect(broken?.counts.error).toBe(true);
  });
});
