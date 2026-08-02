import type { AppDeps } from "../app.js";
import type { Hono } from "hono";

export function registerSearch(app: Hono, deps: AppDeps): void {
  app.get("/api/search", async (c) => c.json(await deps.search(c.req.query("q") ?? "")));
}
