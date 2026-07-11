import type { BeanStatus } from "@beans-frontend/shared";

const STATUS_VAR: Record<BeanStatus, string> = {
  draft: "--s-draft",
  todo: "--s-todo",
  "in-progress": "--s-in-progress",
  completed: "--s-completed",
  scrapped: "--s-scrapped",
};

export const STATUS_LABEL: Record<BeanStatus, string> = {
  draft: "Draft",
  todo: "To do",
  "in-progress": "In progress",
  completed: "Completed",
  scrapped: "Scrapped",
};

export function StatusDot({ status }: { status: BeanStatus }) {
  return (
    <span className="status-dot-wrap">
      <span
        className="status-dot"
        style={{ backgroundColor: `var(${STATUS_VAR[status]})` }}
        aria-hidden="true"
      />
      <span className="status-label">{STATUS_LABEL[status]}</span>
    </span>
  );
}
