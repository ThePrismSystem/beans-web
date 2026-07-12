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

/**
 * Prunes a tree of BeanNodes down to beans matching `predicate`, keeping any
 * ancestor (milestone/epic/etc.) that has at least one matching descendant so
 * it still renders as context/section header. Nodes with no match anywhere
 * in their subtree, and no match themselves, are dropped entirely.
 */
export function pruneTreeToMatches(
  nodes: BeanNode[],
  predicate: (bean: Bean) => boolean,
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
