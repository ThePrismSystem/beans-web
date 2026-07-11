import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runBeansGraphql } from "./executor.js";

const dir = mkdtempSync(join(tmpdir(), "beans-it-"));
const cfg = join(dir, ".beans.yml");

beforeAll(() => {
  execFileSync("beans", ["init"], { cwd: dir });
  execFileSync("beans", ["create", "Integration seed", "-t", "task"], { cwd: dir });
});
afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe("runBeansGraphql (real binary)", () => {
  it("lists the seeded bean", async () => {
    const data = (await runBeansGraphql({
      configPath: cfg,
      query: "{ beans { id title type } }",
    })) as { beans: { title: string }[] };
    expect(data.beans.some((b) => b.title === "Integration seed")).toBe(true);
  });
});
