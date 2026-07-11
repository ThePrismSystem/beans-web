# beans-frontend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a local, single-user web UI over the `beans` CLI that unifies every beans-tracked project under a configurable git root — browse, search, analyze, and fully edit beans (including hierarchy and dependency links) from one editorial-styled interface.

**Architecture:** pnpm monorepo. A thin Hono server discovers projects under `GIT_ROOT`, forwards GraphQL to the `beans` binary per project via `execFile` (no shell), aggregates cross-project search/analytics, and pushes file-change events over SSE. A React 19 + Vite SPA (TanStack Router + Query, GraphQL client typed by codegen from beans' own schema) renders the UI and serves as the only client. Everything runs on localhost.

**Tech Stack:** TypeScript (strict), pnpm workspaces, Hono, `execFile`, chokidar, Zod + `@t3-oss/env-core`, React 19, Vite, TanStack Router, TanStack Query, `graphql-request`, `@graphql-codegen/*`, Vitest, Playwright. All quality tooling from `~/git/new-repo-templating` (ESLint strict, Prettier, knip, cspell, commitlint, husky, renovate, CI).

## Global Constraints

- **Language:** TypeScript only, `strict` + `noUncheckedIndexedAccess` (per template tsconfig). No `any`, no `as unknown as` double-casts, no `eslint-disable` (per user CLAUDE.md).
- **Lint:** `eslint . --max-warnings 0` must pass (zero warnings).
- **Coverage:** 80% lines/functions/branches/statements (v8), enforced in CI.
- **Commits:** Conventional Commits (`type(scope): description`), imperative, ≤72 chars, no period, no emoji, no AI attribution.
- **Bean enums (verbatim):** types `milestone, epic, bug, feature, task`; statuses `draft, todo, in-progress, completed, scrapped`; priorities `critical, high, normal, low, deferred`.
- **Hierarchy rules (verbatim from beans v0.4.0):** `milestone` → no parent; `epic` → parent `milestone`; `feature` → parent `milestone|epic`; `task`/`bug` → parent `milestone|epic|feature`.
- **Security:** all `beans` calls via `execFile` arg-array; every project path resolved and asserted within `GIT_ROOT`.
- **Node:** version from `.nvmrc` (`22`).
- **Design tokens (verbatim):** paper `#f4efe4`, ink `#2a2723`, hairline `#ddd5c4`. Serif titles, sans body, mono for IDs. No gradients/glassmorphism/emoji-hero.
- **Template source:** `~/git/new-repo-templating/templates` (referred to below as `$TPL`). Shared configs are copied verbatim; do not hand-rewrite them.

---

## File Structure

```
beans-frontend/
├── package.json                 # root: private, workspaces, delegating scripts, shared devDeps
├── pnpm-workspace.yaml          # apps/*, packages/*
├── tsconfig.base.json           # shared compiler options
├── .nvmrc .editorconfig .prettierrc.js .prettierignore .npmrc .gitignore
├── commitlint.config.js cspell.config.yaml renovate.json
├── .husky/{pre-commit,pre-push,commit-msg}
├── .github/{workflows/ci.yml,CODEOWNERS,pull_request_template.md,ISSUE_TEMPLATE/*}
├── .env.example
├── docs/{ARCHITECTURE.md, superpowers/{specs,plans}/...}
├── README.md CONTRIBUTING.md LICENSE
├── packages/
│   └── shared/                  # domain types, enums, hierarchy rules, GraphQL docs
│       ├── package.json tsconfig.json vitest.config.ts eslint.config.js
│       └── src/
│           ├── index.ts
│           ├── enums.ts         # BeanType/Status/Priority + arrays
│           ├── hierarchy.ts     # validParentTypes / canParent  (TDD)
│           ├── types.ts         # Bean, Project, ProjectCounts, ServerEvent
│           └── graphql/         # operation documents (queries/mutations as strings)
│               └── operations.ts
├── apps/
│   ├── server/                  # Hono backend (typescript-node flavor)
│   │   ├── package.json tsconfig.json vitest.config.ts eslint.config.js knip.json
│   │   └── src/
│   │       ├── index.ts         # entry: serve app on HOST:PORT
│   │       ├── app.ts           # Hono app factory (createApp(deps))
│   │       ├── env.ts           # t3-env: GIT_ROOT, SCAN_DEPTH, PORT, HOST, BEANS_BIN
│   │       ├── beans/executor.ts        # runBeansGraphql (execFile)  (TDD)
│   │       ├── discovery/scan.ts        # discoverProjects, assertWithinRoot  (TDD)
│   │       ├── aggregate/search.ts      # globalSearch  (TDD)
│   │       ├── aggregate/analytics.ts   # buildAnalytics  (TDD)
│   │       ├── watch/watcher.ts         # BeansWatcher (chokidar → events)  (TDD)
│   │       └── routes/
│   │           ├── projects.ts  # GET /api/projects
│   │           ├── graphql.ts   # POST /api/projects/:name/graphql
│   │           ├── search.ts    # GET /api/search
│   │           ├── analytics.ts # GET /api/analytics
│   │           ├── events.ts    # GET /api/events (SSE)
│   │           └── static.ts    # serve built web app (prod)
│   └── web/                     # React SPA (typescript-react flavor)
│       ├── package.json tsconfig.json tsconfig.node.json vite.config.ts vitest.config.ts
│       ├── eslint.config.js knip.json codegen.ts index.html test-setup.ts
│       └── src/
│           ├── main.tsx router.tsx queryClient.ts
│           ├── api/client.ts            # projectGraphql(), fetchProjects(), etc.
│           ├── api/generated.ts         # graphql-codegen output (typed ops)
│           ├── theme/tokens.css theme/global.css
│           ├── lib/hierarchy.ts         # buildTree() from flat beans
│           ├── hooks/{useProjects,useBeans,useBean,useEvents,useMutations}.ts
│           ├── components/{AppShell,Sidebar,BeanRow,BeanTypeTag,StatusDot,
│           │              HierarchyList,FlatList,FilterBar,LinkedBeans,
│           │              BodyEditor,RelationEditor,ConfirmDialog,Charts}.tsx
│           └── routes/{overview,projectList,beanDetail,analytics,search}.tsx
```

---

## Task 1: Monorepo scaffold & tooling foundation

**Files:**
- Create: `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`, `.env.example`
- Copy (verbatim from `$TPL`): `.nvmrc`, `.editorconfig`, `.prettierrc.js`, `.prettierignore`, `.npmrc`, `.gitignore`, `commitlint.config.js`, `cspell.config.yaml`, `renovate.json`, `.husky/*`, `.github/*`
- Create: `apps/server/`, `apps/web/`, `packages/shared/` package skeletons

**Interfaces:**
- Produces: workspace with `pnpm -r` scripts (`lint`, `typecheck`, `test`, `format`) green on empty skeletons; `tsconfig.base.json` extended by every package.

- [ ] **Step 1: Copy shared config files from the template**

```bash
TPL=~/git/new-repo-templating/templates
cd ~/git/beans-frontend
cp $TPL/typescript-node/.nvmrc .
cp $TPL/_shared/.editorconfig $TPL/_shared/.prettierrc.js $TPL/_shared/.prettierignore \
   $TPL/_shared/.npmrc $TPL/_shared/commitlint.config.js $TPL/_shared/cspell.config.yaml \
   $TPL/_shared/renovate.json .
cp -r $TPL/_shared/.husky .
cp -r $TPL/_shared/.github .
cp $TPL/typescript-node/.github/workflows/ci.yml .github/workflows/ci.yml
# Merge template .gitignore into ours (keep .superpowers/ ignore already present)
cat $TPL/_shared/.gitignore >> .gitignore
sort -u .gitignore -o .gitignore
```

- [ ] **Step 2: Write `pnpm-workspace.yaml`**

```yaml
packages:
  - "apps/*"
  - "packages/*"
```

- [ ] **Step 3: Write `tsconfig.base.json`** (shared compiler options, no `include`)

```json
{
  "$schema": "https://json.schemastore.org/tsconfig",
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true,
    "useUnknownInCatchVariables": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "isolatedModules": true,
    "target": "ES2022",
    "moduleResolution": "Bundler",
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  }
}
```

- [ ] **Step 4: Write root `package.json`** (delegates to workspaces; holds shared dev tooling)

```json
{
  "name": "beans-frontend",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "engines": { "node": ">=22" },
  "scripts": {
    "dev": "pnpm --parallel -r dev",
    "build": "pnpm -r build",
    "typecheck": "pnpm -r typecheck",
    "lint": "eslint . --max-warnings 0",
    "lint:fix": "eslint . --fix --max-warnings 0",
    "format": "prettier --check .",
    "format:fix": "prettier --write .",
    "test": "pnpm -r test",
    "test:coverage": "pnpm -r test:coverage",
    "knip": "pnpm -r knip",
    "spell": "cspell \"**/*.{ts,tsx,md,json}\" --no-progress",
    "prepare": "husky"
  },
  "devDependencies": {
    "@commitlint/cli": "^19.8.0",
    "@commitlint/config-conventional": "^19.8.0",
    "@eslint-community/eslint-plugin-eslint-comments": "^4.7.1",
    "cspell": "^9.0.0",
    "eslint": "^10.0.3",
    "eslint-config-prettier": "^10.0.1",
    "eslint-plugin-import-x": "^4.16.2",
    "eslint-plugin-unicorn": "^63.0.0",
    "husky": "^9.1.7",
    "lint-staged": "^16.4.0",
    "prettier": "^3.5.3",
    "typescript": "^5.7.3",
    "typescript-eslint": "^8.24.1"
  },
  "lint-staged": {
    "*.{js,jsx,ts,tsx}": ["prettier --write", "eslint --fix --max-warnings 0 --no-warn-ignored"],
    "*.{json,md,yaml,yml}": ["prettier --write"]
  },
  "prettier": "./.prettierrc.js"
}
```

- [ ] **Step 5: Create the three package skeletons**

For each package create `package.json`, `tsconfig.json` (extends `../../tsconfig.base.json`), `eslint.config.js` (copy from the matching flavor: `$TPL/typescript-node/eslint.config.js` for `server` and `shared`, `$TPL/typescript-react/eslint.config.js` for `web`), `vitest.config.ts` (copy from matching flavor), and a stub `src/index.ts` exporting a constant so typecheck/test have something.

`packages/shared/package.json`:
```json
{
  "name": "@beans-frontend/shared",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": { ".": "./src/index.ts", "./graphql": "./src/graphql/operations.ts" },
  "scripts": {
    "dev": "tsc --noEmit --watch",
    "build": "tsc",
    "typecheck": "tsc --noEmit",
    "lint": "eslint . --max-warnings 0",
    "test": "vitest run",
    "test:coverage": "vitest run --coverage",
    "knip": "knip"
  },
  "devDependencies": { "@vitest/coverage-v8": "^4.1.0", "vitest": "^4.1.0" }
}
```

`apps/server/package.json` (starts from typescript-node deps; adds Hono + chokidar; shared as workspace dep):
```json
{
  "name": "@beans-frontend/server",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc",
    "typecheck": "tsc --noEmit",
    "lint": "eslint . --max-warnings 0",
    "test": "vitest run",
    "test:unit": "vitest run --exclude '**/*.integration.{test,spec}.ts'",
    "test:coverage": "vitest run --coverage",
    "test:unit:coverage": "vitest run --exclude '**/*.integration.{test,spec}.ts' --coverage",
    "knip": "knip"
  },
  "dependencies": {
    "@beans-frontend/shared": "workspace:*",
    "@hono/node-server": "^1.13.0",
    "hono": "^4.6.0",
    "chokidar": "^4.0.0",
    "@t3-oss/env-core": "^0.13.0",
    "zod": "^3.24.0"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "@vitest/coverage-v8": "^4.1.0",
    "tsx": "^4.19.0",
    "vitest": "^4.1.0"
  }
}
```

`apps/web/package.json` (typescript-react deps + router/query/graphql + shared):
```json
{
  "name": "@beans-frontend/web",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview",
    "typecheck": "tsc -b --noEmit",
    "lint": "eslint . --max-warnings 0",
    "test": "vitest run",
    "test:coverage": "vitest run --coverage",
    "codegen": "graphql-codegen --config codegen.ts",
    "knip": "knip"
  },
  "dependencies": {
    "@beans-frontend/shared": "workspace:*",
    "@tanstack/react-query": "^5.62.0",
    "@tanstack/react-router": "^1.90.0",
    "graphql": "^16.10.0",
    "graphql-request": "^7.1.0",
    "react": "^19.1.0",
    "react-dom": "^19.1.0",
    "recharts": "^2.15.0"
  },
  "devDependencies": {
    "@graphql-codegen/cli": "^5.0.0",
    "@graphql-codegen/typescript": "^4.1.0",
    "@graphql-codegen/typescript-operations": "^4.4.0",
    "@graphql-codegen/typescript-graphql-request": "^6.2.0",
    "@testing-library/jest-dom": "^6.6.0",
    "@testing-library/react": "^16.3.0",
    "@testing-library/user-event": "^14.6.0",
    "@types/react": "^19.1.0",
    "@types/react-dom": "^19.1.0",
    "@vitejs/plugin-react": "^4.5.0",
    "@vitest/coverage-v8": "^4.1.0",
    "jsdom": "^26.1.0",
    "vite": "^6.3.0",
    "vitest": "^4.1.0"
  }
}
```

Each package `tsconfig.json`:
```json
{ "extends": "../../tsconfig.base.json", "compilerOptions": { "outDir": "dist" }, "include": ["src"] }
```
(web adds `"lib": ["ES2022","DOM","DOM.Iterable"]`, `"jsx": "react-jsx"`, and its `tsconfig.node.json` copied from `$TPL/typescript-react`.)

- [ ] **Step 6: Install and verify skeleton is green**

Run:
```bash
cd ~/git/beans-frontend && pnpm install && pnpm exec husky && pnpm typecheck && pnpm lint && pnpm test
```
Expected: install succeeds; typecheck/lint pass; test reports "no tests" per package (acceptable — vitest `run` exits 0 with `passWithNoTests` if configured, otherwise add a trivial `src/index.test.ts` asserting the stub export).

- [ ] **Step 7: Commit**

```bash
git add -A && git commit -m "chore: scaffold pnpm monorepo with shared tooling"
```

---

## Task 2: Shared domain — enums, hierarchy rules, types

**Files:**
- Create: `packages/shared/src/enums.ts`, `hierarchy.ts`, `types.ts`, `index.ts`
- Test: `packages/shared/src/hierarchy.test.ts`

**Interfaces:**
- Produces:
  - `BEAN_TYPES`, `BEAN_STATUSES`, `BEAN_PRIORITIES` (readonly tuples) and `BeanType`, `BeanStatus`, `BeanPriority` union types.
  - `validParentTypes(type: BeanType): BeanType[] | null`
  - `canParent(childType: BeanType, parentType: BeanType): boolean`
  - `interface Bean { id: string; slug: string | null; path: string; title: string; status: BeanStatus; type: BeanType; priority: BeanPriority; tags: string[]; createdAt: string; updatedAt: string; body: string; etag: string; parentId: string | null; blockingIds: string[]; blockedByIds: string[]; }`
  - `interface Project { name: string; path: string; prefix: string; counts: ProjectCounts }`
  - `interface ProjectCounts { total: number; open: number; byType: Record<BeanType, number>; byStatus: Record<BeanStatus, number> }`
  - `interface ServerEvent { project: string; kind: "add" | "change" | "unlink" }`

- [ ] **Step 1: Write `enums.ts`**

```ts
export const BEAN_TYPES = ["milestone", "epic", "feature", "task", "bug"] as const;
export const BEAN_STATUSES = ["draft", "todo", "in-progress", "completed", "scrapped"] as const;
export const BEAN_PRIORITIES = ["critical", "high", "normal", "low", "deferred"] as const;

export type BeanType = (typeof BEAN_TYPES)[number];
export type BeanStatus = (typeof BEAN_STATUSES)[number];
export type BeanPriority = (typeof BEAN_PRIORITIES)[number];

export const OPEN_STATUSES: readonly BeanStatus[] = ["draft", "todo", "in-progress"];
```

- [ ] **Step 2: Write the failing test `hierarchy.test.ts`**

```ts
import { describe, expect, it } from "vitest";
import { canParent, validParentTypes } from "./hierarchy.js";

describe("validParentTypes", () => {
  it("returns null for milestone (no parent allowed)", () => {
    expect(validParentTypes("milestone")).toBeNull();
  });
  it("allows only milestone for epic", () => {
    expect(validParentTypes("epic")).toEqual(["milestone"]);
  });
  it("allows milestone and epic for feature", () => {
    expect(validParentTypes("feature")).toEqual(["milestone", "epic"]);
  });
  it("allows milestone, epic, feature for task and bug", () => {
    expect(validParentTypes("task")).toEqual(["milestone", "epic", "feature"]);
    expect(validParentTypes("bug")).toEqual(["milestone", "epic", "feature"]);
  });
});

describe("canParent", () => {
  it("rejects any parent for a milestone child", () => {
    expect(canParent("milestone", "milestone")).toBe(false);
  });
  it("accepts milestone as parent of epic", () => {
    expect(canParent("epic", "milestone")).toBe(true);
  });
  it("rejects epic as parent of epic", () => {
    expect(canParent("epic", "epic")).toBe(false);
  });
  it("accepts feature as parent of task", () => {
    expect(canParent("task", "feature")).toBe(true);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm --filter @beans-frontend/shared test`
Expected: FAIL — cannot find `./hierarchy.js`.

- [ ] **Step 4: Write `hierarchy.ts`** (direct port of beans `ValidParentTypes`)

```ts
import type { BeanType } from "./enums.js";

export function validParentTypes(type: BeanType): BeanType[] | null {
  switch (type) {
    case "milestone":
      return null;
    case "epic":
      return ["milestone"];
    case "feature":
      return ["milestone", "epic"];
    case "task":
    case "bug":
      return ["milestone", "epic", "feature"];
  }
}

export function canParent(childType: BeanType, parentType: BeanType): boolean {
  const valid = validParentTypes(childType);
  return valid !== null && valid.includes(parentType);
}
```

- [ ] **Step 5: Write `types.ts` and `index.ts`**

`types.ts` — the interfaces listed under **Interfaces** above. `index.ts`:
```ts
export * from "./enums.js";
export * from "./hierarchy.js";
export * from "./types.js";
```

- [ ] **Step 6: Run tests to verify pass**

Run: `pnpm --filter @beans-frontend/shared test`
Expected: PASS (10 assertions).

- [ ] **Step 7: Commit**

```bash
git add packages/shared && git commit -m "feat(shared): add bean enums, hierarchy rules, domain types"
```

---

## Task 3: Server env + beans executor

**Files:**
- Create: `apps/server/src/env.ts`, `apps/server/src/beans/executor.ts`
- Test: `apps/server/src/beans/executor.test.ts`, `apps/server/src/beans/executor.integration.test.ts`

**Interfaces:**
- Consumes: nothing from prior tasks.
- Produces:
  - `env` object with `GIT_ROOT: string`, `SCAN_DEPTH: number`, `PORT: number`, `HOST: string`, `BEANS_BIN: string`.
  - `runBeansGraphql(opts: { configPath: string; query: string; variables?: Record<string, unknown>; binPath?: string }): Promise<unknown>` — resolves parsed `data`, throws `BeansError` (with `.messages: string[]`) on GraphQL errors or non-zero exit.

- [ ] **Step 1: Write `env.ts`**

```ts
import { homedir } from "node:os";
import { resolve } from "node:path";
import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

export const env = createEnv({
  server: {
    GIT_ROOT: z.string().default(resolve(homedir(), "git")).transform((p) => resolve(p)),
    SCAN_DEPTH: z.coerce.number().int().min(1).max(8).default(4),
    PORT: z.coerce.number().int().default(4780),
    HOST: z.string().default("127.0.0.1"),
    BEANS_BIN: z.string().default("beans"),
    NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  },
  runtimeEnv: process.env,
});
```

- [ ] **Step 2: Write the failing unit test `executor.test.ts`** (build-args + error parsing, using an injected fake spawn)

```ts
import { describe, expect, it, vi } from "vitest";
import { buildBeansArgs, parseBeansResult, BeansError } from "./executor.js";

describe("buildBeansArgs", () => {
  it("passes config, json flag, and query as separate argv entries (no shell)", () => {
    const args = buildBeansArgs({ configPath: "/x/.beans.yml", query: "{ beans { id } }" });
    expect(args).toEqual(["graphql", "--json", "--config", "/x/.beans.yml", "{ beans { id } }"]);
  });
  it("adds -v when variables are provided", () => {
    const args = buildBeansArgs({
      configPath: "/x/.beans.yml",
      query: "q",
      variables: { id: "a" },
    });
    expect(args).toContain("-v");
    expect(args).toContain(JSON.stringify({ id: "a" }));
  });
});

describe("parseBeansResult", () => {
  it("returns data on success", () => {
    expect(parseBeansResult('{"data":{"beans":[]}}')).toEqual({ beans: [] });
  });
  it("throws BeansError listing GraphQL error messages", () => {
    expect(() => parseBeansResult('{"errors":[{"message":"bad parent"}]}')).toThrowError(BeansError);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm --filter @beans-frontend/server test`
Expected: FAIL — `./executor.js` not found.

- [ ] **Step 4: Write `executor.ts`**

```ts
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { env } from "../env.js";

const execFileAsync = promisify(execFile);

export class BeansError extends Error {
  constructor(
    message: string,
    readonly messages: string[] = [message],
  ) {
    super(message);
    this.name = "BeansError";
  }
}

export interface RunOpts {
  configPath: string;
  query: string;
  variables?: Record<string, unknown>;
  binPath?: string;
}

export function buildBeansArgs(opts: RunOpts): string[] {
  const args = ["graphql", "--json", "--config", opts.configPath];
  if (opts.variables) args.push("-v", JSON.stringify(opts.variables));
  args.push(opts.query);
  return args;
}

export function parseBeansResult(stdout: string): unknown {
  const parsed = JSON.parse(stdout) as { data?: unknown; errors?: { message: string }[] };
  if (parsed.errors?.length) {
    const messages = parsed.errors.map((e) => e.message);
    throw new BeansError(messages.join("; "), messages);
  }
  return parsed.data;
}

export async function runBeansGraphql(opts: RunOpts): Promise<unknown> {
  const bin = opts.binPath ?? env.BEANS_BIN;
  try {
    const { stdout } = await execFileAsync(bin, buildBeansArgs(opts), {
      maxBuffer: 32 * 1024 * 1024,
    });
    return parseBeansResult(stdout);
  } catch (err) {
    if (err instanceof BeansError) throw err;
    const message = err instanceof Error ? err.message : String(err);
    throw new BeansError(`beans invocation failed: ${message}`);
  }
}
```

- [ ] **Step 5: Run unit tests to verify pass**

Run: `pnpm --filter @beans-frontend/server test:unit`
Expected: PASS.

- [ ] **Step 6: Write integration test `executor.integration.test.ts`** (real `beans` binary against a temp project)

```ts
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runBeansGraphql } from "./executor.js";

const dir = mkdtempSync(join(tmpdir(), "beans-it-"));
const cfg = join(dir, ".beans.yml");

beforeAll(() => {
  execFileSync("beans", ["init", "--prefix", "itx-"], { cwd: dir });
  execFileSync("beans", ["create", "Integration seed", "-t", "task"], { cwd: dir });
  writeFileSync(cfg, `beans:\n  path: .beans\n  prefix: itx-\n`, { flag: "a" });
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
```

Note: `beans init` writes its own `.beans.yml`; if it already exists the `beforeAll` should read the generated config path instead. Verify with `beans init --help` during implementation and adjust the seed to match actual init behavior.

- [ ] **Step 7: Run integration test**

Run: `pnpm --filter @beans-frontend/server test`
Expected: PASS (requires `beans` on PATH).

- [ ] **Step 8: Commit**

```bash
git add apps/server && git commit -m "feat(server): add env config and beans graphql executor"
```

---

## Task 4: Project discovery with GIT_ROOT jail

**Files:**
- Create: `apps/server/src/discovery/scan.ts`
- Test: `apps/server/src/discovery/scan.test.ts`

**Interfaces:**
- Consumes: `env` (Task 3), `Project`/`ProjectCounts` types + `runBeansGraphql` for counts.
- Produces:
  - `assertWithinRoot(root: string, candidate: string): string` — returns the resolved path, throws `Error` if outside root.
  - `findProjectDirs(root: string, maxDepth: number): Promise<string[]>` — dirs containing `.beans.yml`, skipping `node_modules`/`.git`.
  - `discoverProjects(root: string, maxDepth: number): Promise<Project[]>` — full `Project[]` with counts (name = basename, prefix parsed from `.beans.yml`).

- [ ] **Step 1: Write the failing test `scan.test.ts`** (uses a temp fixture tree)

```ts
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { assertWithinRoot, findProjectDirs } from "./scan.js";

let root: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "scan-"));
  const mk = (rel: string) => {
    mkdirSync(join(root, rel), { recursive: true });
    writeFileSync(join(root, rel, ".beans.yml"), "beans:\n  prefix: x-\n");
  };
  mk("proj-a");
  mk("mono/sub-b"); // nested project
  mkdirSync(join(root, "node_modules/pkg"), { recursive: true });
  writeFileSync(join(root, "node_modules/pkg/.beans.yml"), "beans:\n"); // must be ignored
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

describe("findProjectDirs", () => {
  it("finds top-level and nested projects, ignores node_modules", async () => {
    const dirs = (await findProjectDirs(root, 4)).map((d) => d.replace(root + "/", "")).sort();
    expect(dirs).toEqual(["mono/sub-b", "proj-a"]);
  });
});

describe("assertWithinRoot", () => {
  it("accepts a path inside root", () => {
    expect(assertWithinRoot(root, join(root, "proj-a"))).toBe(join(root, "proj-a"));
  });
  it("throws on traversal outside root", () => {
    expect(() => assertWithinRoot(root, join(root, "../etc"))).toThrow(/outside/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @beans-frontend/server test:unit`
Expected: FAIL — `./scan.js` not found.

- [ ] **Step 3: Write `scan.ts`**

```ts
import { readFile, readdir } from "node:fs/promises";
import { basename, join, relative, resolve, sep } from "node:path";
import type { BeanStatus, BeanType, Project, ProjectCounts } from "@beans-frontend/shared";
import { BEAN_STATUSES, BEAN_TYPES, OPEN_STATUSES } from "@beans-frontend/shared";
import { runBeansGraphql } from "../beans/executor.js";

const IGNORED = new Set(["node_modules", ".git", ".beans", "dist", ".next", "coverage"]);

export function assertWithinRoot(root: string, candidate: string): string {
  const r = resolve(root);
  const c = resolve(candidate);
  const rel = relative(r, c);
  if (rel === "" ) return c;
  if (rel.startsWith("..") || rel.split(sep)[0] === "..") {
    throw new Error(`path is outside GIT_ROOT: ${candidate}`);
  }
  return c;
}

export async function findProjectDirs(root: string, maxDepth: number): Promise<string[]> {
  const found: string[] = [];
  async function walk(dir: string, depth: number): Promise<void> {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    if (entries.some((e) => e.isFile() && e.name === ".beans.yml")) found.push(dir);
    if (depth >= maxDepth) return;
    await Promise.all(
      entries
        .filter((e) => e.isDirectory() && !IGNORED.has(e.name) && !e.name.startsWith("."))
        .map((e) => walk(join(dir, e.name), depth + 1)),
    );
  }
  await walk(resolve(root), 0);
  return found;
}

function parsePrefix(yml: string): string {
  const m = /prefix:\s*(\S+)/.exec(yml);
  return m?.[1] ?? "";
}

function emptyCounts(): ProjectCounts {
  const byType = Object.fromEntries(BEAN_TYPES.map((t) => [t, 0])) as Record<BeanType, number>;
  const byStatus = Object.fromEntries(BEAN_STATUSES.map((s) => [s, 0])) as Record<BeanStatus, number>;
  return { total: 0, open: 0, byType, byStatus };
}

export async function discoverProjects(root: string, maxDepth: number): Promise<Project[]> {
  const dirs = await findProjectDirs(root, maxDepth);
  return Promise.all(
    dirs.map(async (dir) => {
      const yml = await readFile(join(dir, ".beans.yml"), "utf8");
      const counts = emptyCounts();
      try {
        const data = (await runBeansGraphql({
          configPath: join(dir, ".beans.yml"),
          query: "{ beans { type status } }",
        })) as { beans: { type: BeanType; status: BeanStatus }[] };
        for (const b of data.beans) {
          counts.total += 1;
          counts.byType[b.type] += 1;
          counts.byStatus[b.status] += 1;
          if (OPEN_STATUSES.includes(b.status)) counts.open += 1;
        }
      } catch {
        // leave zeroed counts if beans query fails for this project
      }
      return { name: basename(dir), path: dir, prefix: parsePrefix(yml), counts };
    }),
  );
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `pnpm --filter @beans-frontend/server test:unit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/server && git commit -m "feat(server): add project discovery with git-root path jail"
```

---

## Task 5: GraphQL passthrough + projects routes (Hono app factory)

**Files:**
- Create: `apps/server/src/app.ts`, `apps/server/src/routes/projects.ts`, `apps/server/src/routes/graphql.ts`
- Test: `apps/server/src/routes/graphql.test.ts`

**Interfaces:**
- Consumes: `discoverProjects`, `assertWithinRoot`, `runBeansGraphql`.
- Produces:
  - `interface AppDeps { root: string; scanDepth: number; listProjects(): Promise<Project[]>; runGraphql(configPath: string, query: string, variables?: Record<string, unknown>): Promise<unknown> }`
  - `createApp(deps: AppDeps): Hono` — mounts `GET /api/projects`, `POST /api/projects/:name/graphql`.
  - `POST` body: `{ query: string; variables?: Record<string, unknown> }`. Response: beans JSON `{ data }` or `{ errors:[{message}] }` with status 400.
  - Project resolution: look up the project by `:name` from `listProjects()`; 404 if unknown; path re-asserted within root before use.

- [ ] **Step 1: Write the failing test `graphql.test.ts`** (inject fake deps; assert routing, 404, error passthrough)

```ts
import { describe, expect, it, vi } from "vitest";
import { createApp } from "../app.js";
import type { Project } from "@beans-frontend/shared";

const project: Project = {
  name: "proj-a",
  path: "/root/proj-a",
  prefix: "x-",
  counts: { total: 0, open: 0, byType: {} as never, byStatus: {} as never },
};

function deps(overrides = {}) {
  return {
    root: "/root",
    scanDepth: 4,
    listProjects: vi.fn(async () => [project]),
    runGraphql: vi.fn(async () => ({ beans: [{ id: "x-1" }] })),
    ...overrides,
  };
}

describe("POST /api/projects/:name/graphql", () => {
  it("forwards the query to the named project and returns data", async () => {
    const d = deps();
    const app = createApp(d);
    const res = await app.request("/api/projects/proj-a/graphql", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ query: "{ beans { id } }" }),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ data: { beans: [{ id: "x-1" }] } });
    expect(d.runGraphql).toHaveBeenCalledWith("/root/proj-a/.beans.yml", "{ beans { id } }", undefined);
  });

  it("returns 404 for an unknown project", async () => {
    const app = createApp(deps());
    const res = await app.request("/api/projects/nope/graphql", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ query: "{ beans { id } }" }),
    });
    expect(res.status).toBe(404);
  });

  it("returns 400 with error messages when beans rejects", async () => {
    const d = deps({
      runGraphql: vi.fn(async () => {
        const { BeansError } = await import("../beans/executor.js");
        throw new BeansError("bad parent", ["bad parent"]);
      }),
    });
    const app = createApp(d);
    const res = await app.request("/api/projects/proj-a/graphql", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ query: "mutation { setParent(id:\"a\",parentId:\"b\"){id} }" }),
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ errors: [{ message: "bad parent" }] });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @beans-frontend/server test:unit`
Expected: FAIL — `../app.js` not found.

- [ ] **Step 3: Write `app.ts`, `routes/projects.ts`, `routes/graphql.ts`**

`app.ts`:
```ts
import { Hono } from "hono";
import type { Project } from "@beans-frontend/shared";
import { registerProjects } from "./routes/projects.js";
import { registerGraphql } from "./routes/graphql.js";

export interface AppDeps {
  root: string;
  scanDepth: number;
  listProjects(): Promise<Project[]>;
  runGraphql(configPath: string, query: string, variables?: Record<string, unknown>): Promise<unknown>;
}

export function createApp(deps: AppDeps): Hono {
  const app = new Hono();
  registerProjects(app, deps);
  registerGraphql(app, deps);
  return app;
}
```

`routes/graphql.ts`:
```ts
import { join } from "node:path";
import type { Hono } from "hono";
import type { AppDeps } from "../app.js";
import { assertWithinRoot } from "../discovery/scan.js";
import { BeansError } from "../beans/executor.js";

interface Body {
  query: string;
  variables?: Record<string, unknown>;
}

export function registerGraphql(app: Hono, deps: AppDeps): void {
  app.post("/api/projects/:name/graphql", async (c) => {
    const name = c.req.param("name");
    const project = (await deps.listProjects()).find((p) => p.name === name);
    if (!project) return c.json({ errors: [{ message: `unknown project: ${name}` }] }, 404);
    const configPath = join(assertWithinRoot(deps.root, project.path), ".beans.yml");
    const body = (await c.req.json()) as Body;
    try {
      const data = await deps.runGraphql(configPath, body.query, body.variables);
      return c.json({ data });
    } catch (err) {
      if (err instanceof BeansError) return c.json({ errors: err.messages.map((m) => ({ message: m })) }, 400);
      throw err;
    }
  });
}
```

`routes/projects.ts`:
```ts
import type { Hono } from "hono";
import type { AppDeps } from "../app.js";

export function registerProjects(app: Hono, deps: AppDeps): void {
  app.get("/api/projects", async (c) => c.json(await deps.listProjects()));
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `pnpm --filter @beans-frontend/server test:unit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/server && git commit -m "feat(server): add hono app with projects and graphql passthrough routes"
```

---

## Task 6: Cross-project aggregation — global search & analytics

**Files:**
- Create: `apps/server/src/aggregate/search.ts`, `apps/server/src/aggregate/analytics.ts`, `apps/server/src/routes/search.ts`, `apps/server/src/routes/analytics.ts`
- Test: `apps/server/src/aggregate/search.test.ts`, `apps/server/src/aggregate/analytics.test.ts`

**Interfaces:**
- Consumes: `AppDeps` (extended), `Project`, `Bean`.
- Produces:
  - `interface SearchHit { project: string; bean: Pick<Bean,"id"|"title"|"type"|"status"|"priority"> }`
  - `globalSearch(projects: Project[], q: string, run: RunFn): Promise<SearchHit[]>` where `RunFn = (configPath: string, query: string, variables?: Record<string,unknown>) => Promise<unknown>`.
  - `interface Analytics { perProject: { project: string; total: number; open: number }[]; byType: Record<BeanType, number>; byStatus: Record<BeanStatus, number>; completedByMonth: { month: string; count: number }[] }` — **define this in `packages/shared/src/types.ts`** (both server and web import it). `analytics.ts` imports it from `@beans-frontend/shared`.
  - `buildAnalytics(projects: Project[], run: RunFn): Promise<Analytics>`
  - Extend `AppDeps` with `search(q: string): Promise<SearchHit[]>` and `analytics(): Promise<Analytics>`; add routes `GET /api/search?q=` and `GET /api/analytics`.

- [ ] **Step 1: Write failing test `search.test.ts`**

```ts
import { describe, expect, it, vi } from "vitest";
import { globalSearch } from "./search.js";
import type { Project } from "@beans-frontend/shared";

const proj = (name: string): Project => ({
  name, path: `/root/${name}`, prefix: "x-",
  counts: { total: 0, open: 0, byType: {} as never, byStatus: {} as never },
});

describe("globalSearch", () => {
  it("queries each project with the search filter and tags hits with project name", async () => {
    const run = vi.fn(async (cfg: string) =>
      cfg.includes("a")
        ? { beans: [{ id: "x-1", title: "auth", type: "task", status: "todo", priority: "normal" }] }
        : { beans: [] },
    );
    const hits = await globalSearch([proj("a"), proj("b")], "auth", run);
    expect(hits).toEqual([
      { project: "a", bean: { id: "x-1", title: "auth", type: "task", status: "todo", priority: "normal" } },
    ]);
    expect(run).toHaveBeenCalledTimes(2);
  });

  it("skips a project that errors rather than failing the whole search", async () => {
    const run = vi.fn(async (cfg: string) => {
      if (cfg.includes("a")) throw new Error("boom");
      return { beans: [{ id: "x-2", title: "auth", type: "bug", status: "todo", priority: "high" }] };
    });
    const hits = await globalSearch([proj("a"), proj("b")], "auth", run);
    expect(hits.map((h) => h.project)).toEqual(["b"]);
  });
});
```

- [ ] **Step 2: Run test — expect FAIL** (`./search.js` missing). Run: `pnpm --filter @beans-frontend/server test:unit`.

- [ ] **Step 3: Write `search.ts`**

```ts
import { join } from "node:path";
import type { BeanPriority, BeanStatus, BeanType, Project } from "@beans-frontend/shared";

export type RunFn = (
  configPath: string,
  query: string,
  variables?: Record<string, unknown>,
) => Promise<unknown>;

export interface SearchHit {
  project: string;
  bean: { id: string; title: string; type: BeanType; status: BeanStatus; priority: BeanPriority };
}

const QUERY =
  "query S($q:String!){ beans(filter:{search:$q}){ id title type status priority } }";

export async function globalSearch(projects: Project[], q: string, run: RunFn): Promise<SearchHit[]> {
  const results = await Promise.all(
    projects.map(async (p) => {
      try {
        const data = (await run(join(p.path, ".beans.yml"), QUERY, { q })) as {
          beans: SearchHit["bean"][];
        };
        return data.beans.map((bean) => ({ project: p.name, bean }));
      } catch {
        return [];
      }
    }),
  );
  return results.flat();
}
```

- [ ] **Step 4: Run test — expect PASS.**

- [ ] **Step 5: Write failing test `analytics.test.ts`**

```ts
import { describe, expect, it, vi } from "vitest";
import { buildAnalytics } from "./analytics.js";
import type { Project } from "@beans-frontend/shared";

const proj = (name: string): Project => ({
  name, path: `/root/${name}`, prefix: "x-",
  counts: { total: 0, open: 0, byType: {} as never, byStatus: {} as never },
});

describe("buildAnalytics", () => {
  it("aggregates totals, per-project counts, and completed-by-month", async () => {
    const run = vi.fn(async () => ({
      beans: [
        { type: "task", status: "completed", updatedAt: "2026-03-14T00:00:00Z" },
        { type: "bug", status: "todo", updatedAt: "2026-03-15T00:00:00Z" },
      ],
    }));
    const a = await buildAnalytics([proj("a")], run);
    expect(a.perProject).toEqual([{ project: "a", total: 2, open: 1 }]);
    expect(a.byType.task).toBe(1);
    expect(a.byStatus.completed).toBe(1);
    expect(a.completedByMonth).toEqual([{ month: "2026-03", count: 1 }]);
  });
});
```

- [ ] **Step 6: Run test — expect FAIL.**

- [ ] **Step 7: Write `analytics.ts`**

```ts
import { join } from "node:path";
import type { Analytics, BeanStatus, BeanType, Project } from "@beans-frontend/shared";
import { BEAN_STATUSES, BEAN_TYPES, OPEN_STATUSES } from "@beans-frontend/shared";
import type { RunFn } from "./search.js";

// Analytics interface lives in packages/shared/src/types.ts (see Interfaces above)

const QUERY = "{ beans { type status updatedAt } }";

export async function buildAnalytics(projects: Project[], run: RunFn): Promise<Analytics> {
  const byType = Object.fromEntries(BEAN_TYPES.map((t) => [t, 0])) as Record<BeanType, number>;
  const byStatus = Object.fromEntries(BEAN_STATUSES.map((s) => [s, 0])) as Record<BeanStatus, number>;
  const months = new Map<string, number>();
  const perProject: Analytics["perProject"] = [];

  await Promise.all(
    projects.map(async (p) => {
      let total = 0;
      let open = 0;
      try {
        const data = (await run(join(p.path, ".beans.yml"), QUERY)) as {
          beans: { type: BeanType; status: BeanStatus; updatedAt: string }[];
        };
        for (const b of data.beans) {
          total += 1;
          byType[b.type] += 1;
          byStatus[b.status] += 1;
          if (OPEN_STATUSES.includes(b.status)) open += 1;
          if (b.status === "completed") {
            const month = b.updatedAt.slice(0, 7);
            months.set(month, (months.get(month) ?? 0) + 1);
          }
        }
      } catch {
        /* skip failed project */
      }
      perProject.push({ project: p.name, total, open });
    }),
  );

  const completedByMonth = [...months.entries()]
    .map(([month, count]) => ({ month, count }))
    .sort((a, b) => a.month.localeCompare(b.month));
  perProject.sort((a, b) => a.project.localeCompare(b.project));
  return { perProject, byType, byStatus, completedByMonth };
}
```

- [ ] **Step 8: Run test — expect PASS.**

- [ ] **Step 9: Write `routes/search.ts` and `routes/analytics.ts`; extend `AppDeps` and `createApp`**

Add to `AppDeps`: `search(q: string): Promise<SearchHit[]>` and `analytics(): Promise<Analytics>`. Register:
```ts
// routes/search.ts
export function registerSearch(app: Hono, deps: AppDeps): void {
  app.get("/api/search", async (c) => c.json(await deps.search(c.req.query("q") ?? "")));
}
// routes/analytics.ts
export function registerAnalytics(app: Hono, deps: AppDeps): void {
  app.get("/api/analytics", async (c) => c.json(await deps.analytics()));
}
```
Call both in `createApp`.

- [ ] **Step 10: Commit**

```bash
git add apps/server && git commit -m "feat(server): add cross-project search and analytics aggregation"
```

---

## Task 7: Live sync — file watcher + SSE route

**Files:**
- Create: `apps/server/src/watch/watcher.ts`, `apps/server/src/routes/events.ts`
- Test: `apps/server/src/watch/watcher.test.ts`

**Interfaces:**
- Consumes: `Project`, chokidar.
- Produces:
  - `class BeansWatcher extends EventEmitter` — `constructor(projects: Project[], factory?: WatchFactory)`; emits `"event"` with `ServerEvent`; `close(): Promise<void>`. `WatchFactory = (paths: string[]) => FSWatcher`-like for injection in tests.
  - `GET /api/events` — SSE stream emitting `data: {json ServerEvent}\n\n` per change; extends `AppDeps` with `watcher: EventEmitter`.

- [ ] **Step 1: Write failing test `watcher.test.ts`** (inject a fake chokidar watcher)

```ts
import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";
import { BeansWatcher } from "./watcher.js";
import type { Project } from "@beans-frontend/shared";

const proj = (name: string): Project => ({
  name, path: `/root/${name}`, prefix: "x-",
  counts: { total: 0, open: 0, byType: {} as never, byStatus: {} as never },
});

describe("BeansWatcher", () => {
  it("maps a changed file under a project's .beans dir to a ServerEvent", async () => {
    const fake = new EventEmitter() as EventEmitter & { close: () => Promise<void> };
    fake.close = vi.fn(async () => undefined);
    const watcher = new BeansWatcher([proj("a")], () => fake);
    const events: unknown[] = [];
    watcher.on("event", (e) => events.push(e));
    fake.emit("change", "/root/a/.beans/x-1--foo.md");
    expect(events).toEqual([{ project: "a", kind: "change" }]);
  });
});
```

- [ ] **Step 2: Run test — expect FAIL.** Run: `pnpm --filter @beans-frontend/server test:unit`.

- [ ] **Step 3: Write `watcher.ts`**

```ts
import { EventEmitter } from "node:events";
import { join, sep } from "node:path";
import chokidar from "chokidar";
import type { Project, ServerEvent } from "@beans-frontend/shared";

export interface WatchLike extends EventEmitter {
  close(): Promise<void>;
}
export type WatchFactory = (paths: string[]) => WatchLike;

const defaultFactory: WatchFactory = (paths) =>
  chokidar.watch(paths, { ignoreInitial: true, depth: 0 }) as unknown as WatchLike;

export class BeansWatcher extends EventEmitter {
  private readonly watch: WatchLike;

  constructor(
    private readonly projects: Project[],
    factory: WatchFactory = defaultFactory,
  ) {
    super();
    this.watch = factory(projects.map((p) => join(p.path, ".beans")));
    for (const kind of ["add", "change", "unlink"] as const) {
      this.watch.on(kind, (path: string) => {
        const project = this.projectFor(path);
        if (project) this.emit("event", { project, kind } satisfies ServerEvent);
      });
    }
  }

  private projectFor(path: string): string | undefined {
    return this.projects.find((p) => path.startsWith(p.path + sep))?.name;
  }

  async close(): Promise<void> {
    await this.watch.close();
  }
}
```

- [ ] **Step 4: Run test — expect PASS.**

- [ ] **Step 5: Write `routes/events.ts`** (SSE via Hono's `streamSSE`; extend `AppDeps` with `watcher: EventEmitter`)

```ts
import type { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import type { ServerEvent } from "@beans-frontend/shared";
import type { AppDeps } from "../app.js";

export function registerEvents(app: Hono, deps: AppDeps): void {
  app.get("/api/events", (c) =>
    streamSSE(c, async (stream) => {
      const handler = (e: ServerEvent) => void stream.writeSSE({ data: JSON.stringify(e) });
      deps.watcher.on("event", handler);
      c.req.raw.signal.addEventListener("abort", () => deps.watcher.off("event", handler));
      while (!c.req.raw.signal.aborted) await stream.sleep(30_000);
    }),
  );
}
```
Add `watcher: EventEmitter` to `AppDeps`, register in `createApp`.

- [ ] **Step 6: Commit**

```bash
git add apps/server && git commit -m "feat(server): add file-watch SSE live-sync stream"
```

---

## Task 8: Server entry — wire deps, static serving, run

**Files:**
- Create: `apps/server/src/index.ts`, `apps/server/src/routes/static.ts`
- Test: `apps/server/src/index.integration.test.ts`

**Interfaces:**
- Consumes: everything above.
- Produces: a runnable server (`pnpm --filter @beans-frontend/server dev`) exposing all `/api/*` routes and serving `apps/web/dist` in production.

- [ ] **Step 1: Write `routes/static.ts`** (serve built SPA in prod, SPA-fallback to `index.html`)

```ts
import type { Hono } from "hono";
import { serveStatic } from "@hono/node-server/serve-static";

export function registerStatic(app: Hono, webDist: string): void {
  app.use("/*", serveStatic({ root: webDist }));
  app.get("/*", serveStatic({ path: "index.html", root: webDist }));
}
```
Add `@hono/node-server` (already a dep). `webDist` is resolved relative to server dir → `../web/dist`.

- [ ] **Step 2: Write `index.ts`** (compose real deps and serve)

```ts
import { serve } from "@hono/node-server";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { env } from "./env.js";
import { createApp } from "./app.js";
import { discoverProjects, assertWithinRoot } from "./discovery/scan.js";
import { runBeansGraphql } from "./beans/executor.js";
import { globalSearch } from "./aggregate/search.js";
import { buildAnalytics } from "./aggregate/analytics.js";
import { BeansWatcher } from "./watch/watcher.js";
import { registerStatic } from "./routes/static.js";

const run = (configPath: string, query: string, variables?: Record<string, unknown>) =>
  runBeansGraphql({ configPath, query, variables });

const listProjects = () => discoverProjects(env.GIT_ROOT, env.SCAN_DEPTH);

const projects = await listProjects();
const watcher = new BeansWatcher(projects);

const app = createApp({
  root: env.GIT_ROOT,
  scanDepth: env.SCAN_DEPTH,
  listProjects,
  runGraphql: run,
  search: async (q) => globalSearch(await listProjects(), q, run),
  analytics: async () => buildAnalytics(await listProjects(), run),
  watcher,
});

const here = dirname(fileURLToPath(import.meta.url));
if (env.NODE_ENV === "production") registerStatic(app, resolve(here, "../../web/dist"));

// touch assertWithinRoot so the jail is exercised at startup for each project
for (const p of projects) assertWithinRoot(env.GIT_ROOT, p.path);

serve({ fetch: app.fetch, hostname: env.HOST, port: env.PORT }, (info) =>
  console.log(`beans-frontend server on http://${env.HOST}:${info.port}`),
);
```

- [ ] **Step 3: Write integration test `index.integration.test.ts`** (boot app against a temp GIT_ROOT with a real beans project; assert `/api/projects` and a passthrough query)

```ts
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "./app.js";
import { discoverProjects } from "./discovery/scan.js";
import { runBeansGraphql } from "./beans/executor.js";

const root = mkdtempSync(join(tmpdir(), "srv-it-"));
const projDir = join(root, "demo");

beforeAll(() => {
  mkdirSync(projDir, { recursive: true });
  execFileSync("beans", ["init", "--prefix", "demo-"], { cwd: projDir });
  execFileSync("beans", ["create", "First bean", "-t", "task"], { cwd: projDir });
});
afterAll(() => rmSync(root, { recursive: true, force: true }));

describe("server integration", () => {
  const run = (cfg: string, q: string, v?: Record<string, unknown>) =>
    runBeansGraphql({ configPath: cfg, query: q, variables: v });
  const listProjects = () => discoverProjects(root, 4);

  it("lists the discovered project", async () => {
    const app = createApp({ root, scanDepth: 4, listProjects, runGraphql: run,
      search: async () => [], analytics: async () => ({ perProject: [], byType: {} as never, byStatus: {} as never, completedByMonth: [] }),
      watcher: new (await import("node:events")).EventEmitter() });
    const res = await app.request("/api/projects");
    const body = (await res.json()) as { name: string }[];
    expect(body.map((p) => p.name)).toContain("demo");
  });

  it("passes a query through to the project", async () => {
    const app = createApp({ root, scanDepth: 4, listProjects, runGraphql: run,
      search: async () => [], analytics: async () => ({ perProject: [], byType: {} as never, byStatus: {} as never, completedByMonth: [] }),
      watcher: new (await import("node:events")).EventEmitter() });
    const res = await app.request("/api/projects/demo/graphql", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ query: "{ beans { title } }" }),
    });
    const body = (await res.json()) as { data: { beans: { title: string }[] } };
    expect(body.data.beans.some((b) => b.title === "First bean")).toBe(true);
  });
});
```

- [ ] **Step 4: Run integration test** — Run: `pnpm --filter @beans-frontend/server test`. Expected: PASS.

- [ ] **Step 5: Manual smoke** — Run `GIT_ROOT=~/git pnpm --filter @beans-frontend/server dev`, then `curl -s localhost:4780/api/projects | head`. Expected: JSON array of your real projects. Stop the server.

- [ ] **Step 6: Commit**

```bash
git add apps/server && git commit -m "feat(server): wire dependencies, static serving, and entrypoint"
```

---

## Task 9: Web foundation — Vite, providers, API client, codegen, theme

**Files:**
- Create: `apps/web/vite.config.ts`, `codegen.ts`, `index.html`, `test-setup.ts`, `src/main.tsx`, `src/queryClient.ts`, `src/api/client.ts`, `src/theme/tokens.css`, `src/theme/global.css`
- Test: `apps/web/src/api/client.test.ts`

**Interfaces:**
- Consumes: server `/api/*` routes.
- Produces:
  - `fetchProjects(): Promise<Project[]>`
  - `projectGraphql<T>(project: string, query: string, variables?: Record<string, unknown>): Promise<T>` — POSTs to `/api/projects/:name/graphql`, unwraps `{data}`, throws `Error(messages.join("; "))` on `{errors}`.
  - `fetchSearch(q: string): Promise<SearchHit[]>`, `fetchAnalytics(): Promise<Analytics>`
  - `queryClient` (TanStack) and mounted `<QueryClientProvider>` + `<RouterProvider>` in `main.tsx`.
  - Theme CSS variables in `tokens.css` (`--paper`, `--ink`, `--hairline`, type-tag colors, etc.).

- [ ] **Step 1: Write `vite.config.ts`** (dev proxy `/api` → server; keep visualizer from template)

```ts
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  server: { proxy: { "/api": "http://localhost:4780" } },
});
```

- [ ] **Step 2: Write `codegen.ts`** (types from beans' live schema; uses a temp schema file generated at implementation time)

```ts
import type { CodegenConfig } from "@graphql-codegen/cli";

const config: CodegenConfig = {
  schema: "./beans.schema.graphql", // generated: `cd <any beans project> && beans graphql --schema > apps/web/beans.schema.graphql`
  documents: ["../../packages/shared/src/graphql/operations.ts", "src/**/*.{ts,tsx}"],
  generates: {
    "src/api/generated.ts": {
      plugins: ["typescript", "typescript-operations"],
      config: { scalars: { Time: "string", ID: "string" }, avoidOptionals: true },
    },
  },
};
export default config;
```
Note: run `beans graphql --schema > apps/web/beans.schema.graphql` (from any beans project dir) before `pnpm --filter @beans-frontend/web codegen`. Commit both the schema snapshot and generated file.

- [ ] **Step 3: Write the failing test `client.test.ts`** (mock `fetch`, assert unwrap + error handling)

```ts
import { afterEach, describe, expect, it, vi } from "vitest";
import { projectGraphql } from "./client.js";

afterEach(() => vi.restoreAllMocks());

describe("projectGraphql", () => {
  it("unwraps data on success", async () => {
    vi.stubGlobal("fetch", vi.fn(async () =>
      new Response(JSON.stringify({ data: { bean: { id: "x-1" } } }), { status: 200 })));
    const out = await projectGraphql<{ bean: { id: string } }>("proj-a", "{ bean { id } }");
    expect(out).toEqual({ bean: { id: "x-1" } });
  });
  it("throws joined messages on errors", async () => {
    vi.stubGlobal("fetch", vi.fn(async () =>
      new Response(JSON.stringify({ errors: [{ message: "bad parent" }] }), { status: 400 })));
    await expect(projectGraphql("proj-a", "mutation {}")).rejects.toThrow("bad parent");
  });
});
```

- [ ] **Step 4: Run test — expect FAIL.** Run: `pnpm --filter @beans-frontend/web test`.

- [ ] **Step 5: Write `src/api/client.ts`**

```ts
import type { Analytics, Project } from "@beans-frontend/shared";

async function json<T>(res: Response): Promise<T> {
  if (!res.ok && res.status !== 400) throw new Error(`request failed: ${res.status}`);
  return (await res.json()) as T;
}

export async function fetchProjects(): Promise<Project[]> {
  return json<Project[]>(await fetch("/api/projects"));
}

export async function projectGraphql<T>(
  project: string,
  query: string,
  variables?: Record<string, unknown>,
): Promise<T> {
  const res = await fetch(`/api/projects/${encodeURIComponent(project)}/graphql`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });
  const body = (await res.json()) as { data?: T; errors?: { message: string }[] };
  if (body.errors?.length) throw new Error(body.errors.map((e) => e.message).join("; "));
  return body.data as T;
}

export interface SearchHit {
  project: string;
  bean: { id: string; title: string; type: string; status: string; priority: string };
}
export async function fetchSearch(q: string): Promise<SearchHit[]> {
  return json<SearchHit[]>(await fetch(`/api/search?q=${encodeURIComponent(q)}`));
}
export async function fetchAnalytics(): Promise<Analytics> {
  return json<Analytics>(await fetch("/api/analytics"));
}
```
(`Analytics` is already exported from `@beans-frontend/shared` per Task 6.)

- [ ] **Step 6: Run test — expect PASS.**

- [ ] **Step 7: Write `theme/tokens.css`, `theme/global.css`, `index.html`, `test-setup.ts`, `queryClient.ts`, `main.tsx`**

`tokens.css`:
```css
:root {
  --paper: #f4efe4;
  --ink: #2a2723;
  --hairline: #ddd5c4;
  --paper-raised: #faf6ec;
  --muted: #8a857b;
  --accent: #9a6b1f;
  --t-milestone: #5a4a8a;
  --t-epic: #9a6b1f;
  --t-feature: #3f6b5f;
  --t-task: #7a7f88;
  --t-bug: #a5452f;
  --font-serif: Georgia, "Times New Roman", serif;
  --font-sans: system-ui, -apple-system, sans-serif;
  --font-mono: ui-monospace, Menlo, Consolas, monospace;
}
:root[data-theme="dark"] {
  --paper: #23211d;
  --ink: #e7e1d4;
  --hairline: #3a3630;
  --paper-raised: #2b2823;
  --muted: #9a948a;
}
```
`global.css`: base element styling (serif headings, sans body, hairline `hr`, monospace for `.bean-id`). `queryClient.ts`: `export const queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: 5_000 } } });`. `main.tsx`: mount `RouterProvider` + `QueryClientProvider`, import both CSS files. (Router created in Task 10.)

- [ ] **Step 8: Verify build wiring** — Run: `pnpm --filter @beans-frontend/web typecheck && pnpm --filter @beans-frontend/web test`. Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add apps/web packages/shared && git commit -m "feat(web): add vite, providers, api client, codegen, editorial theme"
```

---

## Task 10: App shell — sidebar, router, overview landing

**Files:**
- Create: `src/router.tsx`, `src/hooks/useProjects.ts`, `src/components/{AppShell,Sidebar,BeanTypeTag,StatusDot}.tsx`, `src/routes/overview.tsx`
- Test: `src/components/Sidebar.test.tsx`, `src/routes/overview.test.tsx`

**Interfaces:**
- Consumes: `fetchProjects`, `Project`.
- Produces:
  - `useProjects(): UseQueryResult<Project[]>` (queryKey `["projects"]`).
  - Routes: `/` (overview), `/p/$project`, `/p/$project/$beanId`, `/analytics`, `/search` (later tasks fill the components; register all paths now with placeholders so the router type-checks).
  - `<AppShell>` renders `<Sidebar>` + `<Outlet>`. `<Sidebar>` lists Overview, Analytics, then each project with its open count.
  - `<BeanTypeTag type>` and `<StatusDot status>` reusable atoms.

- [ ] **Step 1: Write failing test `Sidebar.test.tsx`**

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Sidebar } from "./Sidebar.js";
import type { Project } from "@beans-frontend/shared";

const projects: Project[] = [
  { name: "handbellhub", path: "/g/handbellhub", prefix: "hh-",
    counts: { total: 10, open: 4, byType: {} as never, byStatus: {} as never } },
];

describe("Sidebar", () => {
  it("renders Overview, Analytics, and each project with its open count", () => {
    render(<Sidebar projects={projects} activeProject={undefined} />);
    expect(screen.getByText("Overview")).toBeInTheDocument();
    expect(screen.getByText("Analytics")).toBeInTheDocument();
    expect(screen.getByText("handbellhub")).toBeInTheDocument();
    expect(screen.getByText("4")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test — expect FAIL.**

- [ ] **Step 3: Implement `Sidebar.tsx`, `BeanTypeTag.tsx`, `StatusDot.tsx`, `AppShell.tsx`**

`Sidebar.tsx` (presentational; links use TanStack Router `<Link>`):
```tsx
import { Link } from "@tanstack/react-router";
import type { Project } from "@beans-frontend/shared";

export function Sidebar({ projects, activeProject }: { projects: Project[]; activeProject: string | undefined }) {
  return (
    <nav className="sidebar">
      <Link to="/" className="side-item">Overview</Link>
      <Link to="/analytics" className="side-item">Analytics</Link>
      <div className="side-label">PROJECTS</div>
      <ul>
        {projects.map((p) => (
          <li key={p.name}>
            <Link to="/p/$project" params={{ project: p.name }}
                  className={`side-item ${p.name === activeProject ? "active" : ""}`}>
              <span>{p.name}</span>
              <span className="count">{p.counts.open}</span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
```
`BeanTypeTag.tsx` uses `var(--t-<type>)`; `StatusDot.tsx` maps status → dot color + label. `AppShell.tsx` composes `useProjects()` + `<Sidebar>` + `<Outlet>` and a header with the ⌘K/global-search entry (search wired in Task 15/optional).

- [ ] **Step 4: Run test — expect PASS.**

- [ ] **Step 5: Write `router.tsx`** — define a root route rendering `<AppShell>`, plus child routes for `/`, `/p/$project`, `/p/$project/$beanId`, `/analytics`, `/search`. For not-yet-built pages, use a temporary `() => <div>coming soon</div>` component so the router type-checks; later tasks replace them.

- [ ] **Step 6: Write `overview.tsx` + test `overview.test.tsx`** — renders a grid of project cards (name, open/total, small type breakdown) from `useProjects()`, each linking to `/p/$project`. Test: render with a mocked `useProjects` returning one project → asserts the card + counts show. Follow the same red→green→commit cycle.

- [ ] **Step 7: Commit**

```bash
git add apps/web && git commit -m "feat(web): add app shell, sidebar, and overview landing"
```

---

## Task 11: Bean list — flat/hierarchy toggle, hierarchy rendering, filters

**Files:**
- Create: `src/lib/hierarchy.ts`, `src/hooks/useBeans.ts`, `src/components/{FlatList,HierarchyList,BeanRow,FilterBar}.tsx`, `src/routes/projectList.tsx`
- Test: `src/lib/hierarchy.test.ts`, `src/components/HierarchyList.test.tsx`, `src/routes/projectList.test.tsx`

**Interfaces:**
- Consumes: `projectGraphql`, `Bean`, `BeanType`, `validParentTypes`.
- Produces:
  - `interface BeanNode { bean: Bean; children: BeanNode[]; depth: number }`
  - `buildTree(beans: Bean[]): { milestones: BeanNode[]; roots: BeanNode[] }` — milestones become top sections; `roots` are parent-less non-milestone beans; children nested by `parentId`.
  - `useBeans(project: string, filter: BeanFilterInput): UseQueryResult<Bean[]>` (queryKey `["beans", project, filter]`).
  - `<FilterBar>` controlling type/status/priority/tag/search state (URL-synced).
  - `<HierarchyList>` (milestone section headers + indented carets, responsive) and `<FlatList>`.

- [ ] **Step 1: Write failing test `hierarchy.test.ts`**

```ts
import { describe, expect, it } from "vitest";
import { buildTree } from "./hierarchy.js";
import type { Bean } from "@beans-frontend/shared";

const bean = (id: string, type: Bean["type"], parentId: string | null): Bean => ({
  id, slug: null, path: "", title: id, status: "todo", type, priority: "normal",
  tags: [], createdAt: "", updatedAt: "", body: "", etag: "", parentId,
  blockingIds: [], blockedByIds: [],
});

describe("buildTree", () => {
  it("nests children under parents and separates milestones from roots", () => {
    const beans = [
      bean("m1", "milestone", null),
      bean("e1", "epic", "m1"),
      bean("t1", "task", "e1"),
      bean("orphan", "task", null),
    ];
    const { milestones, roots } = buildTree(beans);
    expect(milestones).toHaveLength(1);
    expect(milestones[0]!.children[0]!.bean.id).toBe("e1");
    expect(milestones[0]!.children[0]!.children[0]!.bean.id).toBe("t1");
    expect(milestones[0]!.children[0]!.children[0]!.depth).toBe(2);
    expect(roots.map((r) => r.bean.id)).toEqual(["orphan"]);
  });
});
```

- [ ] **Step 2: Run test — expect FAIL.**

- [ ] **Step 3: Write `lib/hierarchy.ts`**

```ts
import type { Bean } from "@beans-frontend/shared";

export interface BeanNode {
  bean: Bean;
  children: BeanNode[];
  depth: number;
}

export function buildTree(beans: Bean[]): { milestones: BeanNode[]; roots: BeanNode[] } {
  const byId = new Map(beans.map((b) => [b.id, b]));
  const childrenOf = new Map<string, Bean[]>();
  for (const b of beans) {
    if (b.parentId && byId.has(b.parentId)) {
      const list = childrenOf.get(b.parentId) ?? [];
      list.push(b);
      childrenOf.set(b.parentId, list);
    }
  }
  const build = (b: Bean, depth: number): BeanNode => ({
    bean: b,
    depth,
    children: (childrenOf.get(b.id) ?? [])
      .sort((x, y) => x.title.localeCompare(y.title))
      .map((child) => build(child, depth + 1)),
  });
  const milestones = beans.filter((b) => b.type === "milestone").map((b) => build(b, 0));
  const roots = beans
    .filter((b) => b.type !== "milestone" && (!b.parentId || !byId.has(b.parentId)))
    .map((b) => build(b, 0));
  return { milestones, roots };
}
```

- [ ] **Step 4: Run test — expect PASS.**

- [ ] **Step 5: Write `HierarchyList.tsx` + `HierarchyList.test.tsx`** — renders milestones as section headers, other nodes with `padding-left: calc(depth * var(--indent))` on desktop; caret buttons toggle a `collapsed` `Set<string>`. Responsive: a CSS media query (`@media (max-width: 640px)`) reduces `--indent` and switches milestone/epic to grouped-section headers. Test asserts: a milestone renders as a section header (`role="heading"` or a `.section-header` testid), a nested task renders with a greater indent than its epic, and clicking a caret hides its subtree. Red→green.

- [ ] **Step 6: Write `FlatList.tsx`, `BeanRow.tsx`, `FilterBar.tsx`** — `BeanRow` shows `<BeanTypeTag>`, title (serif), `<StatusDot>`, and links to `/p/$project/$beanId`. `FilterBar` renders selects for type/status/priority, a tag input, and a search box; it lifts state to `projectList.tsx` which syncs to URL search params and passes a `BeanFilterInput` to `useBeans`. `useBeans` builds a beans `BeanFilter` GraphQL query from the filter.

- [ ] **Step 7: Write `projectList.tsx` + `projectList.test.tsx`** — reads `$project` param + URL filters, toggles flat/hierarchy (persisted to `localStorage` per project), renders the chosen list. Test with mocked `useBeans` returning a small tree → asserts toggle switches between flat and hierarchy rendering. Red→green.

- [ ] **Step 8: Commit**

```bash
git add apps/web && git commit -m "feat(web): add bean list with flat/hierarchy toggle and filters"
```

---

## Task 12: Bean detail page — body + linked beans

**Files:**
- Create: `src/hooks/useBean.ts`, `src/components/LinkedBeans.tsx`, `src/routes/beanDetail.tsx`
- Test: `src/components/LinkedBeans.test.tsx`, `src/routes/beanDetail.test.tsx`

**Interfaces:**
- Consumes: `projectGraphql`, `Bean`.
- Produces:
  - `useBean(project: string, id: string): UseQueryResult<BeanDetail>` where `BeanDetail extends Bean` and additionally resolves `parent`, `children`, `blocking`, `blockedBy` (each `Pick<Bean,"id"|"title"|"type"|"status">[]` / single) via a single GraphQL query traversing relationships. queryKey `["bean", project, id]`.
  - `<LinkedBeans>` — four labeled groups (Parent, Children, Blocks, Blocked by), each item a link to that bean's detail route; empty groups omitted.

- [ ] **Step 1: Write failing test `LinkedBeans.test.tsx`**

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { LinkedBeans } from "./LinkedBeans.js";

describe("LinkedBeans", () => {
  it("renders parent, children, blocks, and blocked-by groups", () => {
    render(
      <LinkedBeans
        project="p"
        parent={{ id: "m1", title: "Milestone", type: "milestone", status: "todo" }}
        children={[{ id: "t1", title: "Task one", type: "task", status: "todo" }]}
        blocking={[{ id: "b1", title: "Blocked thing", type: "task", status: "todo" }]}
        blockedBy={[]}
      />,
    );
    expect(screen.getByText("Parent")).toBeInTheDocument();
    expect(screen.getByText("Milestone")).toBeInTheDocument();
    expect(screen.getByText("Task one")).toBeInTheDocument();
    expect(screen.getByText("Blocks")).toBeInTheDocument();
    expect(screen.queryByText("Blocked by")).not.toBeInTheDocument(); // empty group omitted
  });
});
```

- [ ] **Step 2: Run test — expect FAIL.**

- [ ] **Step 3: Implement `LinkedBeans.tsx`** — renders only non-empty groups; each item is a `<Link to="/p/$project/$beanId">` with a `<BeanTypeTag>` and title.

- [ ] **Step 4: Run test — expect PASS.**

- [ ] **Step 5: Write `useBean.ts`** — GraphQL query:
```
query Bean($id:ID!){ bean(id:$id){ id slug title status type priority tags body etag parentId
  createdAt updatedAt blockingIds blockedByIds
  parent{ id title type status }
  children{ id title type status }
  blocking{ id title type status }
  blockedBy{ id title type status } } }
```
Map into `BeanDetail`. Add a matching operation document in `packages/shared/src/graphql/operations.ts`.

- [ ] **Step 6: Write `beanDetail.tsx` + `beanDetail.test.tsx`** — full-page layout: header (title serif, `<BeanTypeTag>`, `<StatusDot>`, id in mono, priority, timestamps), rendered markdown body (use a small, dependency-light markdown renderer — add `marked` + sanitize, or render fenced/plain text; choose `marked` + `dompurify` and note them as deps), and `<LinkedBeans>`. Test with mocked `useBean` → asserts title, body text, and a linked child render. Red→green.

- [ ] **Step 7: Commit**

```bash
git add apps/web packages/shared && git commit -m "feat(web): add bean detail page with linked beans"
```

---

## Task 13: Editing & creating beans (metadata, body, relationships, scrap/delete)

**Files:**
- Create: `src/hooks/useMutations.ts`, `src/components/{BodyEditor,RelationEditor,ConfirmDialog,CreateBeanForm}.tsx`
- Modify: `src/routes/beanDetail.tsx` (edit affordances)
- Test: `src/hooks/useMutations.test.ts`, `src/components/RelationEditor.test.tsx`, `src/components/CreateBeanForm.test.tsx`

**Interfaces:**
- Consumes: `projectGraphql`, `useBean`, `validParentTypes`, `canParent`, `queryClient`.
- Produces:
  - `useUpdateBean(project)`, `useCreateBean(project)`, `useDeleteBean(project)`, `useSetParent(project)`, `useAddBlocking/removeBlocking/addBlockedBy/removeBlockedBy(project)` — TanStack `useMutation` wrappers that call the beans mutations, pass `ifMatch: etag`, and invalidate `["bean",...]`/`["beans",...]`/`["projects"]` on success. On a beans etag-conflict error, surface a "changed on disk — reload" message.
  - `<RelationEditor>` — given `bean` + candidate list, offers **only valid parents** (`validParentTypes(bean.type)`), hides the parent control for milestones, and add/remove controls for blocks/blocked-by.
  - `<CreateBeanForm>` — fields: title (required), type, parent (filtered by `canParent(selectedType, parentType)`), priority, status, tags, body. Submits `createBean`.

- [ ] **Step 1: Write failing test `RelationEditor.test.tsx`** (hierarchy enforcement in the UI)

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { RelationEditor } from "./RelationEditor.js";
import type { Bean } from "@beans-frontend/shared";

const base: Bean = {
  id: "x1", slug: null, path: "", title: "t", status: "todo", type: "milestone",
  priority: "normal", tags: [], createdAt: "", updatedAt: "", body: "", etag: "e",
  parentId: null, blockingIds: [], blockedByIds: [],
};

describe("RelationEditor", () => {
  it("hides the parent control for milestones", () => {
    render(<RelationEditor bean={base} candidates={[]} onChange={() => {}} />);
    expect(screen.queryByLabelText(/parent/i)).not.toBeInTheDocument();
  });
  it("offers only valid parent types for an epic", () => {
    const epic = { ...base, type: "epic" as const };
    const candidates: Bean[] = [
      { ...base, id: "m1", type: "milestone", title: "M1" },
      { ...base, id: "e2", type: "epic", title: "E2" },
    ];
    render(<RelationEditor bean={epic} candidates={candidates} onChange={() => {}} />);
    const select = screen.getByLabelText(/parent/i);
    expect(select).toHaveTextContent("M1");
    expect(select).not.toHaveTextContent("E2"); // epics can't parent epics
  });
});
```

- [ ] **Step 2: Run test — expect FAIL.**

- [ ] **Step 3: Implement `RelationEditor.tsx`** — parent `<select>` (labelled "Parent") rendered only when `validParentTypes(bean.type) !== null`; options filtered to `candidates.filter((c) => canParent(bean.type, c.type))`. Blocks/blocked-by: multi-add via a bean picker; each current link has a remove button. Calls `onChange` handlers wired to the mutation hooks in `beanDetail.tsx`.

- [ ] **Step 4: Run test — expect PASS.**

- [ ] **Step 5: Write `useMutations.ts`** — each hook, e.g.:
```ts
export function useSetParent(project: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { id: string; parentId: string | null; etag: string }) =>
      projectGraphql(project,
        "mutation($id:ID!,$p:String,$m:String){ setParent(id:$id,parentId:$p,ifMatch:$m){ id } }",
        { id: v.id, p: v.parentId, m: v.etag }),
    onSuccess: (_d, v) => {
      void qc.invalidateQueries({ queryKey: ["bean", project, v.id] });
      void qc.invalidateQueries({ queryKey: ["beans", project] });
    },
  });
}
```
Mirror for `updateBean` (title/status/type/priority/tags/body), `createBean`, `deleteBean`, and the four blocking/blocked-by mutations. Include an `onError` path that detects the etag-conflict message and exposes it for the UI to render.

- [ ] **Step 6: Write `useMutations.test.ts`** — mock `projectGraphql`; assert `useSetParent` sends `ifMatch` and invalidates the right query keys on success. Red→green.

- [ ] **Step 7: Write `BodyEditor.tsx`, `ConfirmDialog.tsx`, `CreateBeanForm.tsx` (+ `CreateBeanForm.test.tsx`)** — `BodyEditor`: `<textarea>` with a "Preview" toggle rendering markdown. `ConfirmDialog`: generic confirm used by delete. `CreateBeanForm`: validates title present, filters parent options by `canParent`, submits `createBean`. Test `CreateBeanForm`: selecting type `epic` limits parent options to milestones; submitting calls the create mutation with the entered fields. Red→green.

- [ ] **Step 8: Wire affordances into `beanDetail.tsx`** — inline edit for title/status/type/priority/tags; `BodyEditor` for body; `RelationEditor` for relationships; a "Scrap" button (`updateBean status:scrapped`, prompts for a `## Reasons for Scrapping` append) and a "Delete" button guarded by `ConfirmDialog` (`deleteBean`); a "+ New bean" entry opening `CreateBeanForm` (supports pre-filled parent = current bean). Extend `beanDetail.test.tsx` with an edit-title flow asserting the update mutation fires.

- [ ] **Step 9: Run all web tests** — Run: `pnpm --filter @beans-frontend/web test`. Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add apps/web packages/shared && git commit -m "feat(web): add bean editing, creation, relationships, scrap and delete"
```

---

## Task 14: Analytics views

**Files:**
- Create: `src/hooks/useAnalytics.ts`, `src/components/Charts.tsx`, `src/routes/analytics.tsx`
- Test: `src/routes/analytics.test.tsx`

**Interfaces:**
- Consumes: `fetchAnalytics`, `Analytics`.
- Produces:
  - `useAnalytics(): UseQueryResult<Analytics>` (queryKey `["analytics"]`).
  - `<Charts>` — beans-per-project bar, completed-by-month line/area, by-status and by-type breakdowns (Recharts), using the editorial palette from `tokens.css` (read via CSS vars / a shared color array). Accessible titles per chart.
  - `analytics.tsx` route rendering the global charts + headline totals; a per-project variant reuses `<Charts>` fed by project-scoped data (derived from `useBeans` or a scoped analytics call).

- [ ] **Step 1: Write failing test `analytics.test.tsx`** — mock `useAnalytics` returning a small dataset; assert the page renders headline totals and one chart title (e.g. "Beans per project"). Recharts renders SVG in jsdom; assert on the surrounding heading/labels, not chart internals.

- [ ] **Step 2: Run test — expect FAIL.**

- [ ] **Step 3: Implement `useAnalytics.ts`, `Charts.tsx`, `analytics.tsx`** — palette pulled from a `CHART_COLORS` constant aligned to the dataviz skill's guidance and the type-tag hues. Wrap each chart in `<ResponsiveContainer>` with a captioned heading.

- [ ] **Step 4: Run test — expect PASS.**

- [ ] **Step 5: Commit**

```bash
git add apps/web && git commit -m "feat(web): add global and per-project analytics views"
```

---

## Task 15: Live-sync client (SSE → query invalidation)

**Files:**
- Create: `src/hooks/useEvents.ts`
- Modify: `src/components/AppShell.tsx` (mount `useEvents`, show "updated" indicator)
- Test: `src/hooks/useEvents.test.ts`

**Interfaces:**
- Consumes: `queryClient`, `ServerEvent`.
- Produces:
  - `useEvents(): { lastEvent: ServerEvent | null }` — opens an `EventSource("/api/events")`, and on each `ServerEvent` invalidates `["beans", project]`, `["bean", project]`, `["projects"]`, `["analytics"]`. Closes on unmount.

- [ ] **Step 1: Write failing test `useEvents.test.ts`** — stub `EventSource` with a controllable fake; assert that dispatching a message event invalidates `["beans", project]` on a spied `queryClient`.

```ts
import { renderHook } from "@testing-library/react";
import { QueryClient } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useEvents } from "./useEvents.js";

class FakeES {
  onmessage: ((e: MessageEvent) => void) | null = null;
  constructor(public url: string) { instances.push(this); }
  close() {}
}
const instances: FakeES[] = [];
afterEach(() => { instances.length = 0; vi.restoreAllMocks(); });

describe("useEvents", () => {
  it("invalidates bean queries when a change event arrives", () => {
    vi.stubGlobal("EventSource", FakeES as unknown as typeof EventSource);
    const qc = new QueryClient();
    const spy = vi.spyOn(qc, "invalidateQueries");
    renderHook(() => useEvents(qc));
    instances[0]!.onmessage?.({ data: JSON.stringify({ project: "p", kind: "change" }) } as MessageEvent);
    expect(spy).toHaveBeenCalledWith({ queryKey: ["beans", "p"] });
  });
});
```

- [ ] **Step 2: Run test — expect FAIL.**

- [ ] **Step 3: Implement `useEvents.ts`** — accept an optional `QueryClient` (defaults to `useQueryClient()`), open `EventSource`, parse events, invalidate the four query keys, track `lastEvent`, close on unmount.

- [ ] **Step 4: Run test — expect PASS.**

- [ ] **Step 5: Mount in `AppShell.tsx`** — call `useEvents()`, render a subtle "updated" pill (fades) when `lastEvent` changes. Extend the shell test minimally if needed.

- [ ] **Step 6: Commit**

```bash
git add apps/web && git commit -m "feat(web): add SSE live-sync with query invalidation"
```

---

## Task 16: E2E flows, docs, and private GitHub repo

**Files:**
- Create: `apps/web/playwright.config.ts`, `apps/web/e2e/beans.spec.ts`
- Create: `README.md`, `docs/ARCHITECTURE.md`, `CONTRIBUTING.md`, `LICENSE`, finalize `.env.example`
- Modify: `.github/workflows/ci.yml` (add build job depending on lint+typecheck; run web tests)

**Interfaces:**
- Consumes: the whole app.
- Produces: green E2E run against a temp fixture GIT_ROOT; complete docs; a **private** GitHub repo with the code pushed.

- [ ] **Step 1: Add Playwright** — `pnpm --filter @beans-frontend/web add -D @playwright/test && pnpm --filter @beans-frontend/web exec playwright install --with-deps chromium`. Write `playwright.config.ts` with a `webServer` that (a) creates a temp GIT_ROOT with a seeded beans project via a setup script, (b) starts the server with that `GIT_ROOT` and the built web app, (c) base URL `http://localhost:4780`.

- [ ] **Step 2: Write `e2e/beans.spec.ts`** — core client-visible contract: overview lists the seeded project → open it → toggle hierarchy → open a bean detail (linked beans visible) → edit its title → create a child bean → scrap it → global search finds a bean → analytics page renders. Use unique titles per run; the fixture cleans up in teardown.

- [ ] **Step 3: Run E2E** — Run: `pnpm --filter @beans-frontend/web build && pnpm --filter @beans-frontend/web exec playwright test`. Expected: PASS. Fix any wiring gaps surfaced here.

- [ ] **Step 4: Write docs** — `README.md` (what it is, prerequisites incl. `beans` on PATH, `pnpm install`, env vars table, `pnpm dev` for both apps, `pnpm build` + run server in prod, screenshots optional). `docs/ARCHITECTURE.md` (server = thin passthrough + discovery + aggregation + SSE; web = SPA typed from beans schema; security jail; data flow diagram in text). `CONTRIBUTING.md` (Conventional Commits, TDD, coverage gate, `pnpm lint/typecheck/test`). `LICENSE` (copy from `$TPL/typescript-node/LICENSE`, set year/owner). Finalize `.env.example`:
```
GIT_ROOT=/home/youruser/git
SCAN_DEPTH=4
PORT=4780
HOST=127.0.0.1
BEANS_BIN=beans
```

- [ ] **Step 5: Update CI** — extend `.github/workflows/ci.yml` so unit tests run across the workspace (`pnpm -r test:coverage`) and add a `build` job (`pnpm -r build`) depending on lint + typecheck. Do NOT add CodeQL/Gitleaks (private repo). Verify locally: `pnpm format && pnpm lint && pnpm typecheck && pnpm -r test:coverage && pnpm -r build` all green.

- [ ] **Step 6: Full verification gate** — Run the entire quality suite from the repo root and confirm each passes before publishing:
```bash
pnpm format && pnpm lint && pnpm typecheck && pnpm -r test:coverage && pnpm knip && pnpm spell
```
Expected: all green, coverage ≥80% per package.

- [ ] **Step 7: Create the private GitHub repo and push**

```bash
cd ~/git/beans-frontend
git add -A && git commit -m "docs: add readme, architecture, contributing, and license"
gh repo create beans-frontend --private --source=. --remote=origin --push
```
Expected: repo created under your account as **private**, `main` pushed. Verify: `gh repo view --json visibility -q .visibility` → `PRIVATE`.

- [ ] **Step 8: Final commit (if CI tweaks needed after first push)** — watch the run with `gh run watch`; fix any CI-only failures (never dismiss as flaky) and push.

---

## Notes for the implementer

- **beans schema snapshot:** Task 9 depends on `apps/web/beans.schema.graphql`. Generate it once from any beans project: `beans graphql --schema > apps/web/beans.schema.graphql`, commit it, and re-run codegen if beans is upgraded.
- **`beans init` behavior:** confirm the exact `.beans.yml` it writes (prefix, path) during Task 3 and align the integration-test seed accordingly.
- **Markdown rendering:** Task 12 introduces `marked` + `dompurify` (sanitized). Add them to `apps/web` deps when you reach that task; keep the renderer isolated in one module.
- **Shared `Analytics` type:** defined in `packages/shared/src/types.ts` (Task 6) and imported by both server aggregation (Task 6) and web (Tasks 9/14).
- **Coverage:** UI atoms and hooks must carry tests to hold the 80% gate; the tests specified above are the minimum — add rendering/branch tests where a component has conditional logic (empty states, error/conflict messages).
