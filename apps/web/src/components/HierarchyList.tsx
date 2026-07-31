import { useMemo, useState } from "react";

import { BeanRow } from "./BeanRow.js";

import { buildTree, collectCollapsibleIds, pruneTreeToMatches } from "../lib/hierarchy.js";
import { beanComparator } from "../lib/sort.js";

import type { BeanNode } from "../lib/hierarchy.js";
import type { SortDir, SortKey } from "../lib/sort.js";
import type { BeanListItem, BeanType } from "@beans-frontend/shared";
import type { ReactNode } from "react";

// Milestones and epics act as visual "sections": when they contain children
// they get a subtle tinted row so containers stand out from leaf beans.
const SECTION_TYPES: readonly BeanType[] = ["milestone", "epic"];

function toggleId(ids: Set<string>, id: string): Set<string> {
  const next = new Set(ids);
  if (next.has(id)) {
    next.delete(id);
  } else {
    next.add(id);
  }
  return next;
}

export function HierarchyList({
  project,
  beans,
  typeFilter,
  sort,
  dir,
}: {
  project: string;
  beans: BeanListItem[];
  /**
   * When set, the tree is pruned client-side to beans matching one of these
   * types plus their ancestor chain, instead of relying on the server-side
   * type filter (which would exclude ancestor milestones/epics entirely and
   * collapse the hierarchy into a flat list).
   */
  typeFilter?: BeanType[];
  /**
   * When set, reorders only the top-level rows (milestones + roots) by this
   * key. Nested children always keep their existing tree order (see
   * buildTree, which sorts children alphabetically by title) so that
   * expanding a parent never surprises the user with a reshuffled subtree.
   */
  sort?: SortKey;
  dir?: SortDir;
}) {
  const tree = useMemo(() => buildTree(beans), [beans]);
  const { milestones, roots } = useMemo(() => {
    if (!typeFilter || typeFilter.length === 0) {
      return tree;
    }
    const matches = (bean: BeanListItem) => typeFilter.includes(bean.type);
    return {
      milestones: pruneTreeToMatches(tree.milestones, matches),
      roots: pruneTreeToMatches(tree.roots, matches),
    };
  }, [tree, typeFilter]);

  const topNodes = useMemo(() => {
    const nodes = [...milestones, ...roots];
    if (!sort) return nodes;
    const cmp = beanComparator(sort, dir ?? "asc");
    return [...nodes].sort((a, b) => cmp(a.bean, b.bean));
  }, [milestones, roots, sort, dir]);

  // The hierarchy starts fully collapsed: only top-level beans are visible
  // until a caret is expanded. Recomputed whenever the underlying tree
  // changes, which also resets any user-driven expand/collapse state back to
  // fully collapsed.
  const initialCollapsed = useMemo(() => new Set(collectCollapsibleIds(topNodes)), [topNodes]);
  const [collapsed, setCollapsed] = useState<Set<string>>(initialCollapsed);
  const [seededFor, setSeededFor] = useState(initialCollapsed);
  if (seededFor !== initialCollapsed) {
    setSeededFor(initialCollapsed);
    setCollapsed(initialCollapsed);
  }

  function toggle(id: string) {
    setCollapsed((current) => toggleId(current, id));
  }

  // A single recursive renderer is used on every viewport so collapsing any
  // parent hides its entire subtree, regardless of nesting depth. Rows with
  // no children render no caret (and no reserved caret column), so top-level
  // childless beans sit flush against the left edge; nesting indent comes
  // only from paddingLeft.
  function renderNode(node: BeanNode): ReactNode {
    const hasChildren = node.children.length > 0;
    const isCollapsed = collapsed.has(node.bean.id);
    const isSection = hasChildren && SECTION_TYPES.includes(node.bean.type);
    const rowClass = isSection
      ? `hierarchy-row hierarchy-row--section hierarchy-row--section-${node.bean.type}`
      : "hierarchy-row";
    return (
      <li key={node.bean.id} className="hierarchy-node" data-depth={node.depth}>
        <div className={rowClass} style={{ paddingLeft: `calc(${node.depth} * var(--indent))` }}>
          {hasChildren ? (
            <button
              type="button"
              className="hierarchy-caret"
              aria-label={isCollapsed ? `Expand ${node.bean.title}` : `Collapse ${node.bean.title}`}
              aria-expanded={!isCollapsed}
              onClick={() => {
                toggle(node.bean.id);
              }}
            >
              {isCollapsed ? "▸" : "▾"}
            </button>
          ) : null}
          <BeanRow project={project} bean={node.bean} />
        </div>
        {hasChildren && !isCollapsed && (
          <ul className="hierarchy-children">{node.children.map((child) => renderNode(child))}</ul>
        )}
      </li>
    );
  }

  return (
    <ul className="hierarchy-list hierarchy-roots">{topNodes.map((node) => renderNode(node))}</ul>
  );
}
