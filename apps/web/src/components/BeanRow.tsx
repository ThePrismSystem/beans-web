import { Link } from "@tanstack/react-router";
import { memo } from "react";

import { BeanTypeTag } from "./BeanTypeTag.js";
import { StatusDot } from "./StatusDot.js";

import type { BeanListItem } from "@beans-web/shared";

/**
 * Memoized because it is the unit a project list is made of. `bean` identities
 * come from memoized tree/filter derivations, so they hold steady across
 * re-renders that don't change the data — an expand/collapse, a filter
 * keystroke, or a live-update flush would otherwise re-render every row.
 */
export const BeanRow = memo(function BeanRow({
  project,
  bean,
  orphaned = false,
}: {
  project: string;
  bean: BeanListItem;
  /** True when this bean is open but its parent is completed or scrapped. */
  orphaned?: boolean;
}) {
  return (
    <Link to="/p/$project/$beanId" params={{ project, beanId: bean.id }} className="bean-row">
      <BeanTypeTag type={bean.type} />
      <span className="bean-row-title">{bean.title}</span>
      {orphaned && <span className="bean-row-orphan">orphaned</span>}
      <StatusDot status={bean.status} />
    </Link>
  );
});
