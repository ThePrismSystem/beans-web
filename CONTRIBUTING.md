# Contributing

## Prerequisites

Node.js 24+, pnpm, and the `beans` CLI on your `PATH`. See the [README](README.md#prerequisites).

```bash
pnpm install
```

## Workflow

1. Create a branch: `type/short-desc` (e.g. `feat/global-search`, `fix/etag-mismatch`).
2. Write a failing test before writing implementation code (TDD, see below).
3. Make the smallest change that makes the test pass, then refactor.
4. Run the full local quality gate before opening a PR (see [Quality gate](#quality-gate)).
5. Commit using [Conventional Commits](#commit-messages).
6. Open a PR against `main`.

## Test-driven development

New code and bug fixes are written test-first: **Red → Green → Refactor**.

- **Unit tests** (`*.test.ts(x)`) cover every conditional branch, error path, and edge case:
  loading/error/empty states for components and hooks, validation branches in `packages/shared`,
  route handlers in `apps/server`. Don't write a test for something TypeScript already guarantees
  at compile time.
- **Integration tests** (`*.integration.test.ts`, `apps/server`) exercise the real `beans` binary
  against a temp git root (see `apps/server/src/index.integration.test.ts` for the fixture
  pattern: `beans init` then `beans create <title> -t <type>` in a `mkdtempSync` directory,
  cleaned up in `afterAll`). Cover success and the primary failure modes (not found, conflict,
  validation error).
- **End-to-end tests** (`apps/web/e2e`, Playwright) validate the app the way a browser sees it:
  full user flows against a real server and a real `beans` project, not mocks.

When fixing a bug, first write a test that reproduces it (it should fail), then fix the bug until
it passes. A failing test is never acceptable to merge or skip. If you inherit one, fix the root
cause.

## Coverage gate

```bash
pnpm -r test:coverage
```

Each package (`apps/server`, `apps/web`, `packages/shared`) is expected to hold at least 90%
coverage; CI runs this as a gate on every PR.

## Commit messages

[Conventional Commits](https://www.conventionalcommits.org/), imperative mood, ≤72 characters,
no trailing period:

```
type(scope): description
```

Types: `feat`, `fix`, `refactor`, `docs`, `test`, `chore`, `style`, `perf`, `ci`, `build`.

## Local checks

Run these before pushing. They're exactly what CI runs:

```bash
pnpm format                          # prettier --check .
pnpm lint                            # eslint . --max-warnings 0
pnpm audit --audit-level moderate    # blocks CI on moderate+ severity vulnerabilities
pnpm typecheck                       # tsc across every package
pnpm -r test:coverage
pnpm -r build
pnpm -r knip                         # unused files/exports/dependencies
pnpm spell                           # cspell
pnpm check:pins                      # the beans CLI version has exactly one source of truth
pnpm codegen:check                   # apps/web/src/api/generated.ts matches the operations
```

`codegen:check` regenerates `apps/web/src/api/generated.ts` in place, formats it, and
fails if the result differs from what is committed. Change a GraphQL document in
`packages/shared/src/graphql/operations.ts` and this is the step that tells you to
commit the regenerated types alongside it. Never hand-edit that file: the check will
overwrite the edit and then fail on it.

### Linting

ESLint config lives **only** at the repo root. Do not add `eslint.config.js` to a
package — ESLint resolves the nearest config file per file, and flat-config `files`
globs are relative to the config's own directory, so a per-package config silently
stops the root's `apps/server/**` patterns from matching and the gate lints nothing.
Run `pnpm lint` from the root.

## TypeScript conventions

- No `as any`, no `as unknown as` double-casts, no `as never`, no `eslint-disable` comments. Fix
  the underlying type mismatch with proper narrowing, generics, or a utility type instead.
- Extract magic numbers to named constants; remove unused imports as you go (`pnpm -r knip` will
  also catch these).

## LSP-first

When exploring the codebase, prefer your editor's LSP (go-to-definition, find-references,
workspace diagnostics) over text search. It understands the TypeScript project structure across
the three packages far better than grep does.
