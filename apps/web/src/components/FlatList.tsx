import { BeanRow } from "./BeanRow.js";

import type { BeanListItem } from "@beans-frontend/shared";

export function FlatList({ project, beans }: { project: string; beans: BeanListItem[] }) {
  if (beans.length === 0) {
    return <p className="muted">No beans match the current filters.</p>;
  }

  return (
    <ul className="flat-list">
      {beans.map((bean) => (
        <li key={bean.id}>
          <BeanRow project={project} bean={bean} />
        </li>
      ))}
    </ul>
  );
}
