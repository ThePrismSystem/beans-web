import type { BeanType } from "@beans-web/shared";

export function BeanTypeTag({ type }: { type: BeanType }) {
  const color = `var(--t-${type})`;
  return (
    <span className="bean-type-tag" style={{ color, borderColor: color }}>
      {type}
    </span>
  );
}
