import { useMemo, useState } from "react";

import { BeanRow } from "./BeanRow.js";

import { useMediaQuery } from "../hooks/useMediaQuery.js";
import { buildGroupedSections, buildTree, pruneTreeToMatches } from "../lib/hierarchy.js";

import type { BeanNode, GroupedSection } from "../lib/hierarchy.js";
import type { Bean, BeanType } from "@beans-frontend/shared";
import type { ReactNode } from "react";

const MOBILE_QUERY = "(max-width: 640px)";

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
}: {
  project: string;
  beans: Bean[];
  /**
   * When set, the tree is pruned client-side to beans matching one of these
   * types plus their ancestor chain, instead of relying on the server-side
   * type filter (which would exclude ancestor milestones/epics entirely and
   * collapse the hierarchy into a flat list).
   */
  typeFilter?: BeanType[];
}) {
  const tree = useMemo(() => buildTree(beans), [beans]);
  const { milestones, roots } = useMemo(() => {
    if (!typeFilter || typeFilter.length === 0) {
      return tree;
    }
    const matches = (bean: Bean) => typeFilter.includes(bean.type);
    return {
      milestones: pruneTreeToMatches(tree.milestones, matches),
      roots: pruneTreeToMatches(tree.roots, matches),
    };
  }, [tree, typeFilter]);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  // CSS media queries can't restructure the DOM, so the shallower mobile
  // grouping (milestones + epics as section headers, everything else
  // flattened to one indent level beneath its nearest section) is driven by
  // this hook instead of a breakpoint-only stylesheet change.
  const isMobile = useMediaQuery(MOBILE_QUERY);
  const grouped = useMemo(
    () => buildGroupedSections([...milestones, ...roots]),
    [milestones, roots],
  );

  function toggle(id: string) {
    setCollapsed((current) => toggleId(current, id));
  }

  function renderNode(node: BeanNode): ReactNode {
    const hasChildren = node.children.length > 0;
    const isCollapsed = collapsed.has(node.bean.id);
    return (
      <li key={node.bean.id} className="hierarchy-node" data-depth={node.depth}>
        <div
          className="hierarchy-row"
          style={{ paddingLeft: `calc(${node.depth} * var(--indent))` }}
        >
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
          ) : (
            <span className="hierarchy-caret-spacer" aria-hidden="true" />
          )}
          <BeanRow project={project} bean={node.bean} />
        </div>
        {hasChildren && !isCollapsed && (
          <ul className="hierarchy-children">{node.children.map((child) => renderNode(child))}</ul>
        )}
      </li>
    );
  }

  function renderLeafRow(bean: Bean, depth: number): ReactNode {
    return (
      <li key={bean.id} className="hierarchy-node" data-depth={depth}>
        <div className="hierarchy-row" style={{ paddingLeft: `calc(${depth} * var(--indent))` }}>
          <span className="hierarchy-caret-spacer" aria-hidden="true" />
          <BeanRow project={project} bean={bean} />
        </div>
      </li>
    );
  }

  function renderGroupedSection(section: GroupedSection): ReactNode {
    const hasLeaves = section.leaves.length > 0;
    const isCollapsed = collapsed.has(section.bean.id);
    return (
      <section
        key={section.bean.id}
        className={`hierarchy-section hierarchy-grouped-section hierarchy-grouped-section--${section.bean.type}`}
        data-depth={section.depth}
        style={{ paddingLeft: `calc(${section.depth} * var(--indent))` }}
      >
        <h2 className="hierarchy-section-header">
          {hasLeaves && (
            <button
              type="button"
              className="hierarchy-caret"
              aria-label={
                isCollapsed ? `Expand ${section.bean.title}` : `Collapse ${section.bean.title}`
              }
              aria-expanded={!isCollapsed}
              onClick={() => {
                toggle(section.bean.id);
              }}
            >
              {isCollapsed ? "▸" : "▾"}
            </button>
          )}
          {section.bean.title}
        </h2>
        {!isCollapsed && hasLeaves && (
          <ul className="hierarchy-children">
            {section.leaves.map((bean) => renderLeafRow(bean, section.depth + 1))}
          </ul>
        )}
      </section>
    );
  }

  if (isMobile) {
    return (
      <div className="hierarchy-list hierarchy-list-grouped">
        {grouped.sections.map((section) => renderGroupedSection(section))}
        {grouped.rootLeaves.length > 0 && (
          <ul className="hierarchy-children hierarchy-roots">
            {grouped.rootLeaves.map((bean) => renderLeafRow(bean, 0))}
          </ul>
        )}
      </div>
    );
  }

  return (
    <div className="hierarchy-list">
      {milestones.map((milestone) => {
        const isCollapsed = collapsed.has(milestone.bean.id);
        return (
          <section key={milestone.bean.id} className="hierarchy-section">
            <h2 className="hierarchy-section-header">
              {milestone.children.length > 0 && (
                <button
                  type="button"
                  className="hierarchy-caret"
                  aria-label={
                    isCollapsed
                      ? `Expand ${milestone.bean.title}`
                      : `Collapse ${milestone.bean.title}`
                  }
                  aria-expanded={!isCollapsed}
                  onClick={() => {
                    toggle(milestone.bean.id);
                  }}
                >
                  {isCollapsed ? "▸" : "▾"}
                </button>
              )}
              {milestone.bean.title}
            </h2>
            {!isCollapsed && milestone.children.length > 0 && (
              <ul className="hierarchy-children">
                {milestone.children.map((child) => renderNode(child))}
              </ul>
            )}
          </section>
        );
      })}
      {roots.length > 0 && (
        <ul className="hierarchy-children hierarchy-roots">
          {roots.map((root) => renderNode(root))}
        </ul>
      )}
    </div>
  );
}
