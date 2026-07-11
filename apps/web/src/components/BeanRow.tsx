import { Link } from "@tanstack/react-router";

import { BeanTypeTag } from "./BeanTypeTag.js";
import { StatusDot } from "./StatusDot.js";

import type { Bean } from "@beans-frontend/shared";

export function BeanRow({ project, bean }: { project: string; bean: Bean }) {
  return (
    <Link to="/p/$project/$beanId" params={{ project, beanId: bean.id }} className="bean-row">
      <BeanTypeTag type={bean.type} />
      <span className="bean-row-title">{bean.title}</span>
      <StatusDot status={bean.status} />
    </Link>
  );
}
