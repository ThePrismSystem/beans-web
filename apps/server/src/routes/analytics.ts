import type { Hono } from "hono";

import type { AppDeps } from "../app.js";

export function registerAnalytics(app: Hono, deps: AppDeps): void {
  app.get("/api/analytics", async (c) => c.json(await deps.analytics()));
}
