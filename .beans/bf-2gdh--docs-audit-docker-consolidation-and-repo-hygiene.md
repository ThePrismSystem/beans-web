---
# bf-2gdh
title: Docs audit, Docker consolidation, and repo hygiene
status: completed
type: task
priority: normal
created_at: 2026-08-01T14:35:45Z
updated_at: 2026-08-01T14:48:09Z
---

Untrack internal working notes, collapse two overlapping Docker documents into the README plus a runnable docker-compose.yml, fix stale claims in the public docs, and humanize the prose.

Plan: docs/superpowers/plans/2026-08-01-docs-audit-and-docker-consolidation.md (local-only; that directory is untracked by task 1).

- [x] Task 1: untrack docs/superpowers, add .gitignore rule
- [x] Task 2: rename docker-compose.example.yml, fold DOCKER_HANDOFF.md into README, delete the handoff doc
- [x] Task 3: fix the incorrect "there is no codecov.yml" claim in ARCHITECTURE.md, sweep links and env defaults
- [x] Task 4: humanizer pass over the four public docs and the bf-vq0w body

## Summary of Changes

Four commits on `docs/audit-and-docker-consolidation`:

- `497bac2` untracked the 13 files under `docs/superpowers/` (~11.8k lines) and added the
  `.gitignore` rule. Files remain on disk.
- `874f294` renamed `docker-compose.example.yml` to `docker-compose.yml`, made the published
  port the active default, folded the substantive parts of `docs/DOCKER_HANDOFF.md` into the
  README's Docker section, and deleted the handoff doc. Also added `docs/superpowers` to
  cspell's `ignorePaths`, since the now-untracked notes were failing `pnpm spell` locally.
- `ff7351d` corrected `docs/ARCHITECTURE.md`, which claimed no `codecov.yml` exists when it
  does.
- `da909d4` humanized the four public docs and this repo's one non-empty bean body.

## Findings worth noting

- `docs/ARCHITECTURE.md` described the path jail as rejecting a relative path that
  `startsWith("..")`. The implementation compares the first path _segment_ instead, which is
  exactly what bf-17or fixed; the old wording described the bug. Corrected, with a note on why
  the segment check is deliberate.
- 11 of 12 pre-existing beans have empty bodies, so the humanizer pass over beans covered one.
- Em dash count across the four docs went 49 -> 9. The nine that remain are load-bearing: a
  heading whose em dash generates the `#known-limitation--optimistic-concurrency` anchor the
  README links to, and a quoted UI string.
- `docker compose config` fails in this shell because `COMPOSE_ENV_FILES` is set in the user's
  environment, not because of anything in the repo. Verified clean with it unset.
