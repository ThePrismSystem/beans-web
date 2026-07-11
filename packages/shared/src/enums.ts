export const BEAN_TYPES = ["milestone", "epic", "feature", "task", "bug"] as const;
export const BEAN_STATUSES = ["draft", "todo", "in-progress", "completed", "scrapped"] as const;
export const BEAN_PRIORITIES = ["critical", "high", "normal", "low", "deferred"] as const;

export type BeanType = (typeof BEAN_TYPES)[number];
export type BeanStatus = (typeof BEAN_STATUSES)[number];
export type BeanPriority = (typeof BEAN_PRIORITIES)[number];

export const OPEN_STATUSES: readonly BeanStatus[] = ["draft", "todo", "in-progress"];
