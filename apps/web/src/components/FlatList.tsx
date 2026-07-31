import { BeanRow } from "./BeanRow.js";

import type { BeanListItem } from "@beans-frontend/shared";

export function FlatList({
  project,
  beans,
  orphaned,
}: {
  project: string;
  beans: BeanListItem[];
  orphaned?: ReadonlySet<string>;
}) {
  if (beans.length === 0) {
    return <p className="muted">No beans match the current filters.</p>;
  }

  return (
    <ul className="flat-list">
      {beans.map((bean) => (
        <li key={bean.id}>
          <BeanRow project={project} bean={bean} orphaned={orphaned?.has(bean.id) ?? false} />
        </li>
      ))}
    </ul>
  );
}
