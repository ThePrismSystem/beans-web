// Entry point run as Playwright's `webServer.command`. Seeds a temp GIT_ROOT
// with a beans project, builds the web app, then starts the production
// server (via the `tsx`-backed `start` script, since `@beans-web/shared`
// is consumed as TS source) pointed at that temp GIT_ROOT.
import { execSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { seedGitRoot } from "./seed.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "..", "..", "..", "..");

const { root } = seedGitRoot();

execSync("pnpm --filter @beans-web/web build", { cwd: repoRoot, stdio: "inherit" });

const port = process.env.PORT ?? "4791";

execSync("pnpm --filter @beans-web/server start", {
  cwd: repoRoot,
  stdio: "inherit",
  env: { ...process.env, NODE_ENV: "production", GIT_ROOT: root, PORT: port },
});
