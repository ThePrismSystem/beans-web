# Simplify Sweep — Discovery Confirmation

Ran 2026-07-31, confirming the design doc's findings before implementation.

- Enum-select duplication: confirmed, 6 instances across `CreateBeanForm.tsx`
  (3) and `beanDetail.tsx` (3).
- Enum-parse duplication: confirmed, 6 instances across the same 2 files.
- Persisted-state duplication: confirmed, 2 files (`projectList.tsx`,
  `HierarchyList.tsx`).
- File size: `beanDetail.tsx` (520 lines) is the only file clearing a
  genuinely-oversized bar; no other file in the repo needs decomposition
  under this sweep.

No new findings outside the design doc's scope.
