// Shared fixture helpers for the Playwright E2E run. Plain JS (not TS) so it
// can be executed directly by `node` from the Playwright `webServer.command`
// and from `globalTeardown`, without going through the app's tsc project.
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/** @typedef {import("./seed.d.mts").SeedState} SeedState */

const STATE_FILE = join(tmpdir(), "beans-web-e2e-state.json");

const PROJECT_NAME = "e2e-project";

/**
 * Creates a fresh temp GIT_ROOT containing a single beans project, seeded
 * with a top-level "feature" bean (so the E2E flow can add a real child
 * bean under it) plus the exact `beans init` / `beans create ... -t task`
 * sequence beans-web's own integration tests rely on. Bean titles are
 * timestamped so re-runs never collide.
 *
 * @returns {SeedState}
 */
export function seedGitRoot() {
  const root = mkdtempSync(join(tmpdir(), "beans-e2e-"));
  const projectDir = join(root, PROJECT_NAME);
  mkdirSync(projectDir, { recursive: true });

  execFileSync("beans", ["init"], { cwd: projectDir, stdio: "inherit" });

  const stamp = Date.now();
  const taskTitle = `First bean ${stamp}`;
  const featureTitle = `E2E feature ${stamp}`;

  execFileSync("beans", ["create", taskTitle, "-t", "task"], { cwd: projectDir, stdio: "inherit" });
  execFileSync("beans", ["create", featureTitle, "-t", "feature"], {
    cwd: projectDir,
    stdio: "inherit",
  });

  // A second project with no beans, so the E2E suite can exercise empty-state UI.
  const emptyProjectName = "e2e-empty";
  const emptyProjectDir = join(root, emptyProjectName);
  mkdirSync(emptyProjectDir, { recursive: true });
  execFileSync("beans", ["init"], { cwd: emptyProjectDir, stdio: "inherit" });

  const state = {
    root,
    projectDir,
    projectName: PROJECT_NAME,
    taskTitle,
    featureTitle,
    emptyProjectName,
    emptyProjectDir,
  };
  writeFileSync(STATE_FILE, JSON.stringify(state));
  return state;
}

/** @returns {SeedState} */
export function readSeedState() {
  return JSON.parse(readFileSync(STATE_FILE, "utf8"));
}

export function cleanupGitRoot() {
  let state;
  try {
    state = readSeedState();
  } catch {
    return;
  }
  rmSync(state.root, { recursive: true, force: true });
  rmSync(STATE_FILE, { force: true });
}
