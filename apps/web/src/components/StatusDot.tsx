import type { BeanStatus } from "@beans-frontend/shared";

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
        style={{ backgroundColor: `var(--s-${status})` }}
        aria-hidden="true"
      />
      <span className="status-label">{STATUS_LABEL[status]}</span>
    </span>
  );
}
