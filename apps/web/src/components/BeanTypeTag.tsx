import type { BeanType } from "@beans-frontend/shared";

const TYPE_VAR: Record<BeanType, string> = {
  milestone: "--t-milestone",
  epic: "--t-epic",
  feature: "--t-feature",
  task: "--t-task",
  bug: "--t-bug",
};

export function BeanTypeTag({ type }: { type: BeanType }) {
  const color = `var(${TYPE_VAR[type]})`;
  return (
    <span className="bean-type-tag" style={{ color, borderColor: color }}>
      {type}
    </span>
  );
}
