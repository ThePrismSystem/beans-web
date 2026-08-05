import { defaultComparator } from "./sort.js";

import type { BeanListItem } from "@beans-web/shared";

export interface BeanNode {
  bean: BeanListItem;
  children: BeanNode[];
  depth: number;
  /**
   * Orphaned beans anywhere beneath this node, not counting the node itself.
   * Lets a collapsed row advertise stranded work nested under it.
   */
  orphanedDescendants: number;
}

function countOrphans(children: BeanNode[], orphaned: ReadonlySet<string>): number {
  return children.reduce(
    (sum, child) => sum + child.orphanedDescendants + (orphaned.has(child.bean.id) ? 1 : 0),
    0,
  );
}

export function buildTree(
  beans: BeanListItem[],
  orphaned: ReadonlySet<string> = new Set(),
): { milestones: BeanNode[]; roots: BeanNode[] } {
  const byId = new Map(beans.map((b) => [b.id, b]));
  const childrenOf = new Map<string, BeanListItem[]>();
  for (const b of beans) {
    if (b.parentId && byId.has(b.parentId)) {
      const list = childrenOf.get(b.parentId) ?? [];
      list.push(b);
      childrenOf.set(b.parentId, list);
    }
  }
  const build = (b: BeanListItem, depth: number): BeanNode => {
    // Copy before sorting: `childrenOf` holds the live arrays, and sorting in
    // place would reorder them for every later reader.
    const children = [...(childrenOf.get(b.id) ?? [])]
      .sort(defaultComparator)
      .map((child) => build(child, depth + 1));
    return { bean: b, depth, children, orphanedDescendants: countOrphans(children, orphaned) };
  };
  const milestones = beans.filter((b) => b.type === "milestone").map((b) => build(b, 0));
  const roots = beans
    .filter((b) => b.type !== "milestone" && (!b.parentId || !byId.has(b.parentId)))
    .map((b) => build(b, 0));
  return { milestones, roots };
}

/**
 * Prunes a tree of BeanNodes down to beans matching `predicate`, keeping any
 * ancestor (milestone/epic/etc.) that has at least one matching descendant so
 * it still renders as context/section header. Nodes with no match anywhere
 * in their subtree, and no match themselves, are dropped entirely.
 *
 * Orphan counts are recomputed from the surviving children so a count always
 * describes what is actually nested beneath the node in the rendered tree.
 */
export function pruneTreeToMatches(
  nodes: BeanNode[],
  predicate: (bean: BeanListItem) => boolean,
  orphaned: ReadonlySet<string> = new Set(),
): BeanNode[] {
  const result: BeanNode[] = [];
  for (const node of nodes) {
    const children = pruneTreeToMatches(node.children, predicate, orphaned);
    if (predicate(node.bean) || children.length > 0) {
      result.push({ ...node, children, orphanedDescendants: countOrphans(children, orphaned) });
    }
  }
  return result;
}

/**
 * Given a subset of `all` (e.g. beans matching a prefix filter), returns that
 * subset plus every ancestor (milestone/epic/etc.) needed so the hierarchy
 * still has somewhere to nest each match, deduplicated. Safe against parent
 * cycles since a bean already added to `keep` stops the walk.
 */
export function withAncestors<T extends BeanListItem>(list: T[], all: T[]): T[] {
  const byId = new Map(all.map((b) => [b.id, b]));
  const keep = new Map(list.map((b) => [b.id, b]));
  for (const bean of list) {
    let parentId = bean.parentId;
    while (parentId && byId.has(parentId) && !keep.has(parentId)) {
      const parent = byId.get(parentId);
      if (!parent) {
        break;
      }
      keep.set(parentId, parent);
      parentId = parent.parentId;
    }
  }
  return [...keep.values()];
}
