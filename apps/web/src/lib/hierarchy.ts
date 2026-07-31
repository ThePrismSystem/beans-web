import type { BeanListItem } from "@beans-frontend/shared";

export interface BeanNode {
  bean: BeanListItem;
  children: BeanNode[];
  depth: number;
}

export function buildTree(beans: BeanListItem[]): { milestones: BeanNode[]; roots: BeanNode[] } {
  const byId = new Map(beans.map((b) => [b.id, b]));
  const childrenOf = new Map<string, BeanListItem[]>();
  for (const b of beans) {
    if (b.parentId && byId.has(b.parentId)) {
      const list = childrenOf.get(b.parentId) ?? [];
      list.push(b);
      childrenOf.set(b.parentId, list);
    }
  }
  const build = (b: BeanListItem, depth: number): BeanNode => ({
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

/**
 * Prunes a tree of BeanNodes down to beans matching `predicate`, keeping any
 * ancestor (milestone/epic/etc.) that has at least one matching descendant so
 * it still renders as context/section header. Nodes with no match anywhere
 * in their subtree, and no match themselves, are dropped entirely.
 */
export function pruneTreeToMatches(
  nodes: BeanNode[],
  predicate: (bean: BeanListItem) => boolean,
): BeanNode[] {
  const result: BeanNode[] = [];
  for (const node of nodes) {
    const children = pruneTreeToMatches(node.children, predicate);
    if (predicate(node.bean) || children.length > 0) {
      result.push({ ...node, children });
    }
  }
  return result;
}

/**
 * Recursively collects the id of every node that has at least one child,
 * used to seed the collapsed set so a hierarchy starts fully collapsed
 * (only leaf-less top-level nodes visible).
 */
export function collectCollapsibleIds(nodes: BeanNode[]): string[] {
  const ids: string[] = [];
  const walk = (list: BeanNode[]) => {
    for (const node of list) {
      if (node.children.length > 0) {
        ids.push(node.bean.id);
        walk(node.children);
      }
    }
  };
  walk(nodes);
  return ids;
}

/**
 * Given a subset of `all` (e.g. beans matching a prefix filter), returns that
 * subset plus every ancestor (milestone/epic/etc.) needed so the hierarchy
 * still has somewhere to nest each match, deduplicated. Safe against parent
 * cycles since a bean already added to `keep` stops the walk.
 */
export function withAncestors(list: BeanListItem[], all: BeanListItem[]): BeanListItem[] {
  const byId = new Map(all.map((b) => [b.id, b]));
  const keep = new Map(list.map((b) => [b.id, b]));
  for (const bean of list) {
    let parentId = bean.parentId;
    while (parentId && byId.has(parentId) && !keep.has(parentId)) {
      const parent = byId.get(parentId)!;
      keep.set(parentId, parent);
      parentId = parent.parentId;
    }
  }
  return [...keep.values()];
}
