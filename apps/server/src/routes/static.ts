import type { Hono } from "hono";
import { serveStatic } from "@hono/node-server/serve-static";

export function registerStatic(app: Hono, webDist: string): void {
  app.use("/*", serveStatic({ root: webDist }));
  app.get("/*", serveStatic({ path: "index.html", root: webDist }));
}
