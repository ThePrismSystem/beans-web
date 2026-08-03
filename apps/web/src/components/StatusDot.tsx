import { STATUS_LABEL } from "../lib/statusLabel.js";

import type { BeanStatus } from "@beans-frontend/shared";

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
