import { EventEmitter } from "node:events";

import { Hono } from "hono";
import { logger } from "hono/logger";
import { secureHeaders } from "hono/secure-headers";

import { registerAnalytics } from "./routes/analytics.js";
import { registerEvents } from "./routes/events.js";
import { registerGraphql } from "./routes/graphql.js";
import { registerProjects } from "./routes/projects.js";
import { registerSearch } from "./routes/search.js";
import { registerSecurity } from "./routes/security.js";
import { withoutQuery, writeLog } from "./util/logging.js";

import type { ProjectRecord } from "./discovery/scan.js";
import type { Analytics, SearchResult } from "@beans-frontend/shared";

export interface AppDeps {
  roots: string[];
  scanDepth: number;
  listProjects: () => Promise<ProjectRecord[]>;
  runGraphql: (
    configPath: string,
    query: string,
    variables?: Record<string, unknown>,
  ) => Promise<unknown>;
  search: (q: string) => Promise<SearchResult>;
  analytics: () => Promise<Analytics>;
  watcher: EventEmitter;
  trustProxy: boolean;
}

export function createApp(deps: AppDeps): Hono {
  const app = new Hono();
  // All assets are self-hosted (vite bundles JS/CSS; no CDNs), so a self-only
  // policy holds. `'unsafe-inline'` on style-src covers React/Recharts inline
  // styles; `frame-ancestors 'none'` blocks clickjacking of the local UI.
  app.use(
    "*",
    secureHeaders({
      contentSecurityPolicy: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:"],
        frameAncestors: ["'none'"],
        baseUri: ["'self'"],
        objectSrc: ["'none'"],
      },
    }),
  );
  // Scoped to /api/* so serving the SPA and its assets stays quiet, and placed
  // ahead of the guards so rejected requests (415/403) are logged too. Request
  // and response bodies are never logged by hono/logger, and withoutQuery
  // strips the query string, so neither the GraphQL query/variables nor
  // search text ever reaches an operator log.
  app.use(
    "/api/*",
    logger((message) => {
      writeLog(withoutQuery(message));
    }),
  );
  registerSecurity(app, deps.trustProxy);
  registerProjects(app, deps);
  registerGraphql(app, deps);
  registerSearch(app, deps);
  registerAnalytics(app, deps);
  registerEvents(app, deps);
  return app;
}
