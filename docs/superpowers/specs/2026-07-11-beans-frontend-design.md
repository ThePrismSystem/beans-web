# beans-frontend — Design

**Status:** Approved (2026-07-11)
**Owner:** callie.sarenpa@gmail.com

## 1. Purpose

A local, single-user web UI over the [`beans`](https://github.com/hmans/beans) CLI that unifies
every beans-tracked project under a configurable git root (`~/git` by default). From one place you
can browse, search, analyze, and fully edit beans across all projects — including their hierarchy and
dependency links — without leaving the browser.

Non-goals: multi-user access, authentication, remote hosting, or replacing the beans CLI. This is a
personal local tool. It reads the local filesystem and executes the local `beans` binary.

## 2. Constraints & Ground Truth

- **Data source:** each project is a directory containing a `.beans.yml` config and a `.beans/`
  directory of markdown files (one bean per file, YAML-ish frontmatter + markdown body).
- **Integration surface:** the `beans` binary exposes a full GraphQL API via `beans graphql`
  (aliased `beans query`) with `--json` output, `--schema`, `--config <path>`, and `--beans-path`.
  It provides queries **and** mutations: `createBean`, `updateBean`, `deleteBean`, `setParent`,
  `addBlocking`/`removeBlocking`, `addBlockedBy`/`removeBlockedBy`.
- **No daemon:** `beans` is invoked per-command against one project (located via upward `.beans.yml`
  search or `--config`). There is no long-running beans server; the frontend's backend shells out.
- **Enumerations:**
  - Types: `milestone, epic, bug, feature, task`
  - Statuses: `draft, todo, in-progress, completed, scrapped`
  - Priorities: `critical, high, normal, low, deferred`
- **Optimistic concurrency:** every bean has an `etag`; mutations accept `ifMatch` to detect
  changes made externally (CLI, coding agents) between read and write.
- **Full-text search:** beans uses Bleve query syntax (`term`, `term~`, `log*`, `"exact phrase"`,
  `AND`/`OR`, field-scoped `title:`/`body:`/`slug:`).

### 2.1 Hierarchy rules (from beans v0.4.0 `ValidParentTypes`)

| Bean type | Allowed parent types |
|-----------|----------------------|
| `milestone` | **none** — cannot have a parent |
| `epic` | `milestone` |
| `feature` | `milestone`, `epic` |
| `task`, `bug` | `milestone`, `epic`, `feature` |

Blocking / blocked-by links are validated by beans for existence and cycles. The UI must respect
these rules: only offer valid parent candidates for a given bean type, hide the "set parent" affordance
for milestones, and surface beans' validation error verbatim if a mutation is rejected.

## 3. Stack & Architecture

**Repo:** pnpm monorepo.

- `apps/server` — Node + [Hono](https://hono.dev). TypeScript.
- `apps/web` — React 19 + Vite. TypeScript.
- `packages/shared` — shared types + GraphQL operation documents.

**Tooling (repo-wide, from `new-repo-templating`):** strict ESLint (typescript-eslint strict,
import ordering, unicorn, prettier-compat), Prettier, Vitest (+ v8 coverage), Playwright (E2E),
knip, cspell, commitlint (Conventional Commits), husky + lint-staged, renovate, t3-env (Zod-validated
env), GitHub Actions CI, PR/issue templates, CODEOWNERS. `graphql-codegen` generates TypeScript types
from beans' own schema (`beans graphql --schema`) so the UI is end-to-end typed against the real API
with no hand-maintained DTOs.

**Data flow:** React (TanStack Query) → server GraphQL passthrough endpoint → `execFile('beans', …)`
→ per-project `.beans/` files. SSE stream carries file-change invalidations back to the client.

### 3.1 Server responsibilities (deliberately thin)

1. **Project discovery** — recursive scan of `GIT_ROOT` to a bounded depth (default 4), treating any
   directory containing `.beans.yml` as a project. Ignores `node_modules`, `.git`, and other noise.
   Returns `{ name, path, prefix, counts }` per project. Handles nested repos (e.g. a monorepo
   containing sub-projects with their own `.beans`).
2. **GraphQL passthrough** — forwards a client query/mutation to `beans graphql` for a named project
   via `execFile` with an **argument array (no shell)**, injecting `--config <project>/.beans.yml`
   and `--json`. Returns beans' JSON verbatim (including GraphQL errors). This keeps beans' full API
   available with almost no server-side logic.
3. **Cross-project aggregation** — for global search and global analytics, fans out the query to each
   discovered project and merges/normalizes results (tagging each bean with its project).
4. **Live sync** — `chokidar` watches every project's `.beans/` directory; on change it emits an SSE
   event (`{ project, kind }`) that the client uses to invalidate the relevant TanStack Query caches.
   The UI shows a subtle "updated" indicator rather than a jarring reload.

### 3.2 Security posture (local, single-user)

- Bind to loopback by default; LAN binding is opt-in via env.
- **GIT_ROOT jail:** every project path is resolved and asserted to be within `GIT_ROOT`
  (path-traversal guard). Requests referencing paths outside the root are rejected.
- **No shell execution:** all `beans` invocations use `execFile` with an args array; no string
  interpolation into a shell. Query text is passed as a single argument / via stdin.
- No authentication (out of scope) — the app assumes a trusted local machine.

## 4. Design Language — Editorial

Chosen direction: a warm "engineering logbook" aesthetic, deliberately avoiding generic AI patterns
(no indigo/purple gradients, no glassmorphism, no emoji hero, no cookie-cutter card grid).

- **Palette:** warm paper background (`#f4efe4` class), ink text (`#2a2723`), hairline rules
  (`#ddd5c4`-ish). A restrained set of ink accents. Dark mode is a warm charcoal counterpart — not
  the default "AI dark" near-black-blue.
- **Type:** serif display/titles (Georgia-class), clean sans for body and UI chrome, monospace for
  bean IDs and code. Hairline separators instead of heavy cards/shadows.
- **Bean type tags:** small, type-colored labels (milestone / epic / feature / task / bug) with a
  consistent, muted palette. Status conveyed by a small dot + text, not loud pills.
- **Charts:** editorial-tuned palette per the `dataviz` skill; accessible in both themes.

## 5. Information Architecture

- **Persistent left project sidebar** listing all discovered projects (with live open counts), plus
  pinned top items: **Overview** and **Analytics**.
- **Landing = all-projects Overview:** project cards showing live counts (open, by-type highlights)
  and at-a-glance analytics. Clicking a project (card or sidebar) enters that project's bean list.
- **Global search in the header (⌘K)** — searches across all projects; results grouped by project.
- **Routing (TanStack Router):** `/` (overview), `/p/:project` (list), `/p/:project/:beanId`
  (detail), `/analytics`, `/search`. Every bean detail has its own linkable URL.

## 6. Bean List

- **Flat ⇄ Hierarchy toggle** persisted per project.
- **Hierarchy mode:**
  - **Milestones render as section headers** (grouped-section styling).
  - Nested epics / features / tasks / bugs use **plain indentation + collapsible carets**.
  - Beans with no milestone/epic parent appear at the top level directly (an implicit "no milestone"
    group — never forced into a bucket).
  - **Responsive:** desktop uses full indentation depth; mobile drops to the shallower
    grouped-section treatment to reclaim horizontal space. Same data, adaptive density.
- **Flat mode:** a single sortable list of the project's beans.
- **Filters:** type, status, priority, tags, and text search (Bleve syntax). Filters compose and are
  reflected in the URL. Search can be scoped to the current project or run globally.

## 7. Bean Detail — Full Page

Dedicated route per bean (`/p/:project/:beanId`), roomy for reading and editing.

- **Rendered markdown body** (with a raw/preview toggle in edit mode).
- **Linked beans panel** showing every relationship, each item linking to its own detail page:
  - **Parent** (with breadcrumb up the chain)
  - **Children**
  - **Blocks** (beans this one is blocking)
  - **Blocked by** (beans blocking this one)
- **Metadata:** id, slug, status, type, priority, tags, created/updated timestamps.

### 7.1 Editing (full CRUD)

All of the following are editable from the detail page; create is available via a "+ New bean" form:

- **Title, status, type, priority, tags** — inline edit (selects / tag input).
- **Body** — markdown `<textarea>` with a live preview toggle. Respects the file-based markdown
  format; no heavy rich-text editor. (Body updates use full replacement; structured `bodyMod`
  replace/append is available for future targeted edits.)
- **Relationships:**
  - **Parent** — set/clear via `setParent`. The picker offers **only valid parent candidates** for
    the bean's type per §2.1; the affordance is hidden for milestones. Beans validates and the UI
    surfaces any error.
  - **Children** — add/remove by re-parenting the child bean (a child's parent is the edited bean).
    Same type-validity constraints apply from the child's perspective.
  - **Blocks / Blocked-by** — add/remove via `addBlocking`/`removeBlocking` /
    `addBlockedBy`/`removeBlockedBy`. Beans enforces existence and cycle prevention; errors surfaced.
- **Create** — "+ New bean" form: title (required), type, parent (constrained to valid types),
  priority, status, tags, body. Optionally pre-filled (e.g. create child under current bean).
- **Scrap vs Delete:**
  - **Scrap** — one-click soft action; sets status to `scrapped`. Prompts to add a
    `## Reasons for Scrapping` note (per beans convention).
  - **Delete** — hard delete (`deleteBean`, removes the file and incoming links); guarded behind an
    explicit confirmation.
- **Optimistic concurrency:** every mutation sends the current `etag` as `ifMatch`. If the file
  changed on disk since load (external CLI/agent edit), the mutation is rejected and the UI shows a
  "changed on disk — reload" notice instead of silently clobbering.

## 8. Analytics

- **Overview (global):** beans per project (bar), completed over time (line/area, from `createdAt`
  → completed transitions inferable via status + `updatedAt`), open beans by status and by type
  (breakdowns), and headline totals.
- **Per-project:** the same charts scoped to one project.
- Rendered with a lightweight charting approach and the editorial `dataviz` palette; readable in
  both light and dark themes.

## 9. Configuration (env, via t3-env + Zod)

| Var | Purpose | Default |
|-----|---------|---------|
| `GIT_ROOT` | Root folder to scan for projects | `~/git` |
| `SCAN_DEPTH` | Max recursion depth for discovery | `4` |
| `PORT` | Server port | `4780` (uncommon, avoids local service clashes) |
| `HOST` | Bind address (loopback vs LAN) | `127.0.0.1` |
| `BEANS_BIN` | Path to the `beans` binary | `beans` (PATH) |

## 10. Testing

- **Unit (Vitest):** discovery/path-jail logic, aggregation/merge, GraphQL passthrough arg building,
  hierarchy-validity helpers, React components/hooks.
- **Integration:** server endpoints against a temp fixture git root with real `.beans` projects and
  the real `beans` binary — success + primary failure modes (not found, invalid parent, etag
  conflict, path outside root).
- **E2E (Playwright):** the core flows a user sees — browse → filter → open detail → edit metadata
  and relationships → create → scrap/delete → search → analytics render. Fixtures use unique data and
  clean up after themselves.

## 11. Repository & Docs

- **GitHub:** private repo under the user's account (public later). Scaffolded from
  `new-repo-templating` (TypeScript flavor(s)); a monorepo layout is assembled on top.
- **Docs:** `README.md` (setup, env, running), `docs/ARCHITECTURE.md` (server/web/shared boundaries,
  beans integration), `CONTRIBUTING.md`, `LICENSE`, `.env.example`, GitHub PR/issue templates.

## 12. Open Items / Future (out of scope for v1)

- Archived beans view (`beans archive`).
- Roadmap view (`beans roadmap`).
- Bulk operations across projects.
- Making the repo public (adds CodeQL + Gitleaks workflows).
