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

export interface GroupedSection {
  bean: Bean;
  /** Indent level for the section header itself (0 for a top-level section). */
  depth: number;
  /** All non-container descendants, flattened to a single list regardless of original nesting depth. */
  leaves: Bean[];
}

/**
 * Collects every descendant of `node` that is NOT itself a milestone/epic
 * section header into `sink`, flattening deep nesting (e.g. epic -> feature
 * -> task) into a single list. Stops descending into a nested epic since
 * that epic gets its own section instead of being absorbed as a leaf.
 */
function collectLeaves(node: BeanNode, sink: Bean[]): void {
  for (const child of node.children) {
    if (child.bean.type === "epic") {
      continue;
    }
    sink.push(child.bean);
    collectLeaves(child, sink);
  }
}

function pushSections(node: BeanNode, depth: number, sections: GroupedSection[]): void {
  const leaves: Bean[] = [];
  collectLeaves(node, leaves);
  leaves.sort((a, b) => a.title.localeCompare(b.title));
  sections.push({ bean: node.bean, depth, leaves });
  for (const child of node.children) {
    if (child.bean.type === "epic") {
      pushSections(child, depth + 1, sections);
    }
  }
}

/**
 * Builds a shallow, mobile-friendly grouping from a full BeanNode tree
 * (as produced by `buildTree`, optionally pruned by `pruneTreeToMatches`):
 * milestones and epics become section headers, and every other descendant
 * (features/tasks/bugs, at any depth) is flattened to a single indent level
 * beneath its nearest milestone/epic section instead of nesting deeply.
 * Parent-less non-container beans are returned as `rootLeaves` with no
 * forced header, matching how `buildTree`'s `roots` render today.
 */
export function buildGroupedSections(nodes: BeanNode[]): {
  sections: GroupedSection[];
  rootLeaves: Bean[];
} {
  const sections: GroupedSection[] = [];
  const rootLeaves: Bean[] = [];
  for (const node of nodes) {
    if (node.bean.type === "milestone" || node.bean.type === "epic") {
      pushSections(node, 0, sections);
    } else {
      rootLeaves.push(node.bean);
      collectLeaves(node, rootLeaves);
    }
  }
  return { sections, rootLeaves };
}
