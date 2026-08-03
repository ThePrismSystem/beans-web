import type { BeanStatus } from "@beans-frontend/shared";

export const STATUS_LABEL: Record<BeanStatus, string> = {
  draft: "Draft",
  todo: "To do",
  "in-progress": "In progress",
  completed: "Completed",
  scrapped: "Scrapped",
};
