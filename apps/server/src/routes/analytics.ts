import type { AppDeps } from "../app.js";
import type { Hono } from "hono";

export function registerAnalytics(app: Hono, deps: AppDeps): void {
  app.get("/api/analytics", async (c) => c.json(await deps.analytics()));
}
