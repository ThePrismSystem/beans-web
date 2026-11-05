---
# bf-phhj
title: Harden the public repository to match handbells
status: completed
type: task
priority: normal
created_at: 2026-11-05T14:00:00Z
updated_at: 2026-11-05T14:12:17Z
parent: bf-wivr
---

Phase E4 of bf-wivr. Bring beans-web's GitHub settings, rulesets and workflows up to the handbells-used-chart-dorico-plugin baseline.

## Todo

- [x] Workflows: persist-credentials false on every checkout; top-level permissions {} with per-job grants
- [x] CodeQL: scan the actions language as well
- [x] Scan job: zizmor and gitleaks with SARIF upload to code scanning
- [x] Renovate: pinGitHubActionDigests, 7-day minimum release age, platformCommit, gitleaks custom manager
- [x] Repo settings: immutable releases, squash-only merge buttons, Projects off
- [x] Tag ruleset: v* tags cannot be deleted, force-pushed or updated
- [x] main ruleset: no bypass, 0 approvals, thread resolution, CodeQL code-scanning rule, checks pinned to their apps, codecov/patch required
- [x] Open the PR; its CI run is the first under the new gate

## Summary of Changes

Workflows: `permissions: {}` at the top of ci.yml and codeql.yml with per-job grants; `persist-credentials: false` on every checkout; codecov-action pin comments corrected to v7.0.0 (zizmor ref-version-mismatch). CodeQL now runs a matrix over `actions` and `javascript-typescript`. New Repo Scan job runs zizmor 1.31.1 and gitleaks 8.30.1, both SHA-256-verified release downloads, failing on findings and uploading SARIF.

Renovate: `helpers:pinGitHubActionDigests`, global 7-day `minimumReleaseAge` (security updates exempt), `platformCommit: enabled`, and a regex manager that moves each scanner VERSION and SHA256 together.

GitHub settings, applied through the API: merge-commit and rebase buttons off (squash only), Projects off, immutable releases on, a `release tags` ruleset on `refs/tags/v*` blocking deletion, force-push and update, and the `main` ruleset now has no bypass actors, 0 required approvals, no code-owner requirement, required thread resolution, a CodeQL code-scanning rule (high or higher security alerts, errors), and every required check pinned to its app (GitHub Actions 15368, codecov/patch 254) with Analyze split per language and Repo Scan added.

The TypeScript analysis keeps the category it used before the matrix (`.github/workflows/codeql.yml:analyze`) so dismissed alert #1 keeps its dismissal and code scanning can compare pull requests against main. Only the new actions analysis uses `/language:actions`.
