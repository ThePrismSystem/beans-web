import { Link } from "@tanstack/react-router";

import { BeanTypeTag } from "./BeanTypeTag.js";
import { StatusDot } from "./StatusDot.js";

import type { BeanListItem } from "@beans-frontend/shared";

export function BeanRow({
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
}
