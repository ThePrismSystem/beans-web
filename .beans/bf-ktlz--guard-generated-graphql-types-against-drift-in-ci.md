---
# bf-ktlz
title: Guard generated GraphQL types against drift in CI
status: completed
type: task
priority: normal
created_at: 2026-08-02T16:23:37Z
updated_at: 2026-08-02T16:23:52Z
---

## Summary

Nothing verified that `apps/web/src/api/generated.ts` matched the operations it is
generated from. That is why `bf-9lal` (codegen could not resolve its plugin) went
unnoticed for as long as it did, and why the file could be hand-edited during `bf-r69r`
without anything objecting.

## Approach

`pnpm codegen:check` runs codegen, formats the result with prettier, then
`git diff --exit-code` on the generated file. It lives at the root because prettier is
a root devDependency and is not linked into `apps/web`. Added to the Quality CI job
next to knip and spell.

Codegen emits unformatted output, so the prettier step is required — without it the
check would fail on every run purely on formatting.

The check regenerates in place rather than diffing against a temp copy. That means a
developer whose file is stale ends up with the corrected file in their working tree,
which is what they need to commit anyway. It also means a hand edit is overwritten
before the diff runs, so the check reports the committed content, not the edit.

## Acceptance criteria

- [x] `pnpm codegen:check` exits 0 on a current tree
- [x] It exits non-zero, with a readable diff, when the committed file is stale
- [x] Wired into the Quality job in CI
- [x] Documented in CONTRIBUTING.md and CLAUDE.md

## Summary of Changes

Verified both directions rather than only the happy path: the check passes on a current
tree, and with a deliberately stale `generated.ts` committed it exits 1 and prints the
offending line.

The first attempt at that negative test was wrong and passed when it should have failed.
Editing the working-tree file proves nothing, because codegen overwrites it before the
diff. The stale content has to be in HEAD, which is exactly the case the check exists to
catch.
