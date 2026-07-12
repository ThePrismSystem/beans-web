import { BeanRow } from "./BeanRow.js";

import type { Bean } from "@beans-frontend/shared";

export interface SectionHeaderRowProps {
  project: string;
  bean: Bean;
  collapsed: boolean;
  hasChildren: boolean;
  onToggle: () => void;
}

export function SectionHeaderRow({
  project,
  bean,
  collapsed,
  hasChildren,
  onToggle,
}: SectionHeaderRowProps) {
  return (
    <div className={`hierarchy-section-header hierarchy-section-header--${bean.type}`}>
      {hasChildren ? (
        <button
          type="button"
          className="hierarchy-caret"
          aria-label={collapsed ? `Expand ${bean.title}` : `Collapse ${bean.title}`}
          aria-expanded={!collapsed}
          onClick={onToggle}
        >
          {collapsed ? "▸" : "▾"}
        </button>
      ) : (
        <span className="hierarchy-caret-spacer" aria-hidden="true" />
      )}
      <BeanRow project={project} bean={bean} />
    </div>
  );
}
