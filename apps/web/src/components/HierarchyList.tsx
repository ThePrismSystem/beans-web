import { useMemo } from "react";

import { usePersistedProjectState } from "../hooks/usePersistedState.js";
import { buildTree, pruneTreeToMatches } from "../lib/hierarchy.js";
import { beanComparator } from "../lib/sort.js";
import { readStringSet, writeStringSet } from "../lib/storage.js";

import { BeanRow } from "./BeanRow.js";

import type { BeanNode } from "../lib/hierarchy.js";
import type { SortDir, SortKey } from "../lib/sort.js";
import type { BeanListItem, BeanType } from "@beans-frontend/shared";
import type { ReactNode } from "react";

// Milestones and epics act as visual "sections": when they contain children
// they get a subtle tinted row so containers stand out from leaf beans.
const SECTION_TYPES: readonly BeanType[] = ["milestone", "epic"];

function toggleId(ids: ReadonlySet<string>, id: string): Set<string> {
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
  orphaned,
  knownIds,
  typeFilter,
  sort,
  dir,
}: {
  project: string;
  beans: BeanListItem[];
  /** Ids of open beans whose parent is completed or scrapped. */
  orphaned: ReadonlySet<string>;
  /**
   * Ids present in the full (unfiltered) project dataset. Persisted expand
   * state is pruned against this on write so it stays bounded by project size
   * and deleted beans do not accumulate. Pruning on write rather than read
   * means an id temporarily hidden by a filter keeps its expansion.
   */
  knownIds: ReadonlySet<string>;
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
   * buildTree, which sorts children by the default comparator) so that
   * expanding a parent never surprises the user with a reshuffled subtree.
   */
  sort?: SortKey;
  dir?: SortDir;
}) {
  const tree = useMemo(() => buildTree(beans, orphaned), [beans, orphaned]);
  const { milestones, roots } = useMemo(() => {
    if (!typeFilter || typeFilter.length === 0) {
      return tree;
    }
    const matches = (bean: BeanListItem) => typeFilter.includes(bean.type);
    return {
      milestones: pruneTreeToMatches(tree.milestones, matches, orphaned),
      roots: pruneTreeToMatches(tree.roots, matches, orphaned),
    };
  }, [tree, typeFilter, orphaned]);

  const topNodes = useMemo(() => {
    const nodes = [...milestones, ...roots];
    if (!sort) return nodes;
    const cmp = beanComparator(sort, dir ?? "asc");
    return [...nodes].sort((a, b) => cmp(a.bean, b.bean));
  }, [milestones, roots, sort, dir]);

  // Expanded ids, not collapsed ones: absence means collapsed, which is the
  // default we want, so a node appearing for the first time needs no seeding —
  // and there is no seeding step left to re-fire when the data refetches.
  const [expanded, setExpanded] = usePersistedProjectState<ReadonlySet<string>>(
    project,
    "expanded",
    readStringSet,
    writeStringSet,
  );

  function toggle(id: string) {
    setExpanded((current) => {
      const next = toggleId(current, id);
      return new Set([...next].filter((value) => knownIds.has(value)));
    });
  }

  // A single recursive renderer is used on every viewport so collapsing any
  // parent hides its entire subtree, regardless of nesting depth. Rows with
  // no children render no caret (and no reserved caret column), so top-level
  // childless beans sit flush against the left edge; nesting indent comes
  // only from paddingLeft.
  function renderNode(node: BeanNode): ReactNode {
    const hasChildren = node.children.length > 0;
    const isExpanded = expanded.has(node.bean.id);
    const isSection = hasChildren && SECTION_TYPES.includes(node.bean.type);
    const rowClass = isSection
      ? `hierarchy-row hierarchy-row--section hierarchy-row--section-${node.bean.type}`
      : "hierarchy-row";
    return (
      <li key={node.bean.id} className="hierarchy-node" data-depth={node.depth}>
        <div
          className={rowClass}
          style={{ paddingLeft: `calc(${String(node.depth)} * var(--indent))` }}
        >
          {hasChildren ? (
            <button
              type="button"
              className="hierarchy-caret"
              aria-label={isExpanded ? `Collapse ${node.bean.title}` : `Expand ${node.bean.title}`}
              aria-expanded={isExpanded}
              onClick={() => {
                toggle(node.bean.id);
              }}
            >
              {isExpanded ? "▾" : "▸"}
            </button>
          ) : null}
          <BeanRow project={project} bean={node.bean} orphaned={orphaned.has(node.bean.id)} />
          {node.orphanedDescendants > 0 && (
            <span className="hierarchy-orphan-count">⚠ {node.orphanedDescendants} orphaned</span>
          )}
        </div>
        {hasChildren && isExpanded && (
          <ul className="hierarchy-children">{node.children.map((child) => renderNode(child))}</ul>
        )}
      </li>
    );
  }

  return (
    <ul className="hierarchy-list hierarchy-roots">{topNodes.map((node) => renderNode(node))}</ul>
  );
}
