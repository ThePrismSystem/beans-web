import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Hono } from "hono";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { registerStatic } from "./static.js";

const webDist = mkdtempSync(join(tmpdir(), "static-it-"));

beforeAll(() => {
  writeFileSync(join(webDist, "index.html"), "<html>shell</html>");
  writeFileSync(join(webDist, "app.js"), "console.log('hi')");
});
afterAll(() => rmSync(webDist, { recursive: true, force: true }));

describe("registerStatic", () => {
  it("serves an existing asset directly", async () => {
    const app = new Hono();
    registerStatic(app, webDist);
    const res = await app.request("/app.js");
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("console.log('hi')");
  });

  it("falls back to index.html for unknown routes (SPA fallback)", async () => {
    const app = new Hono();
    registerStatic(app, webDist);
    const res = await app.request("/some/client/route");
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("<html>shell</html>");
  });
});
