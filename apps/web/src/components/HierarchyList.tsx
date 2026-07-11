import { useMemo, useState } from "react";

import { BeanRow } from "./BeanRow.js";

import { buildTree } from "../lib/hierarchy.js";

import type { BeanNode } from "../lib/hierarchy.js";
import type { Bean } from "@beans-frontend/shared";
import type { ReactNode } from "react";

function toggleId(ids: Set<string>, id: string): Set<string> {
  const next = new Set(ids);
  if (next.has(id)) {
    next.delete(id);
  } else {
    next.add(id);
  }
  return next;
}

export function HierarchyList({ project, beans }: { project: string; beans: Bean[] }) {
  const { milestones, roots } = useMemo(() => buildTree(beans), [beans]);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

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
