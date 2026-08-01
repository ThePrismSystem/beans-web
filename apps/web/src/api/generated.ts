/** Internal type. DO NOT USE DIRECTLY. */
type Exact<T extends { [key: string]: unknown }> = { [K in keyof T]: T[K] };
/** Internal type. DO NOT USE DIRECTLY. */
export type Incremental<T> =
  T | { [P in keyof T]?: P extends " $fragmentName" | "__typename" ? T[P] : never };
/**
 * Structured body modifications applied atomically.
 * Operations are applied in order: all replacements sequentially, then append.
 * If any operation fails, the entire mutation fails (transactional).
 */
export type BodyModification = {
  /**
   * Text to append after all replacements.
   * Appended with blank line separator.
   */
  append: string | null | undefined;
  /**
   * Text replacements applied sequentially in array order.
   * Each old text must match exactly once at the time it's applied.
   */
  replace: Array<ReplaceOperation> | null | undefined;
};

/** Input for creating a new bean */
export type CreateBeanInput = {
  /** Bean IDs that are blocking this bean */
  blockedBy: Array<string> | null | undefined;
  /** Bean IDs this bean is blocking */
  blocking: Array<string> | null | undefined;
  /** Markdown body content */
  body: string | null | undefined;
  /** Parent bean ID (validated against type hierarchy) */
  parent: string | null | undefined;
  /** Custom ID prefix (overrides config prefix for this bean) */
  prefix: string | null | undefined;
  /** Priority level (defaults to 'normal') */
  priority: string | null | undefined;
  /** Status (defaults to 'todo') */
  status: string | null | undefined;
  /** Tags for categorization */
  tags: Array<string> | null | undefined;
  /** Bean title (required) */
  title: string;
  /** Bean type (defaults to 'task') */
  type: string | null | undefined;
};

/** A single text replacement operation. */
export type ReplaceOperation = {
  /** Replacement text (can be empty to delete the matched text) */
  new: string;
  /** Text to find (must occur exactly once, cannot be empty) */
  old: string;
};

/** Input for updating an existing bean */
export type UpdateBeanInput = {
  /** Add beans to blocked-by list (validates cycles and existence) */
  addBlockedBy: Array<string> | null | undefined;
  /** Add beans to blocking list (validates cycles and existence) */
  addBlocking: Array<string> | null | undefined;
  /** Add tags to existing list */
  addTags: Array<string> | null | undefined;
  /** New body content (full replacement, mutually exclusive with bodyMod) */
  body: string | null | undefined;
  /** Structured body modifications (mutually exclusive with body) */
  bodyMod: BodyModification | null | undefined;
  /** ETag for optimistic concurrency control (optional) */
  ifMatch: string | null | undefined;
  /** Set parent bean ID (null/empty to clear, validates type hierarchy) */
  parent: string | null | undefined;
  /** New priority */
  priority: string | null | undefined;
  /** Remove beans from blocked-by list */
  removeBlockedBy: Array<string> | null | undefined;
  /** Remove beans from blocking list */
  removeBlocking: Array<string> | null | undefined;
  /** Remove tags from existing list */
  removeTags: Array<string> | null | undefined;
  /** New status */
  status: string | null | undefined;
  /** Replace all tags (nil preserves existing, mutually exclusive with addTags/removeTags) */
  tags: Array<string> | null | undefined;
  /** New title */
  title: string | null | undefined;
  /** New type */
  type: string | null | undefined;
};

export type BeanDetailQueryVariables = Exact<{
  id: string;
}>;

export type BeanDetailQuery = {
  bean: {
    id: string;
    slug: string | null;
    path: string;
    title: string;
    status: string;
    type: string;
    priority: string;
    tags: Array<string>;
    body: string;
    etag: string;
    parentId: string | null;
    createdAt: string;
    updatedAt: string;
    blockingIds: Array<string>;
    blockedByIds: Array<string>;
    parent: { id: string; title: string; type: string; status: string } | null;
    children: Array<{ id: string; title: string; type: string; status: string }>;
    blocking: Array<{ id: string; title: string; type: string; status: string }>;
    blockedBy: Array<{ id: string; title: string; type: string; status: string }>;
  } | null;
};

export type UpdateBeanMutationVariables = Exact<{
  id: string;
  input: UpdateBeanInput;
}>;

export type UpdateBeanMutation = { updateBean: { id: string; etag: string } };

export type CreateBeanMutationVariables = Exact<{
  input: CreateBeanInput;
}>;

export type CreateBeanMutation = { createBean: { id: string; etag: string } };

export type DeleteBeanMutationVariables = Exact<{
  id: string;
}>;

export type DeleteBeanMutation = { deleteBean: boolean };

export type SetParentMutationVariables = Exact<{
  id: string;
  parentId: string | null | undefined;
}>;

export type SetParentMutation = { setParent: { id: string; etag: string } };

export type AddBlockingMutationVariables = Exact<{
  id: string;
  targetId: string;
}>;

export type AddBlockingMutation = { addBlocking: { id: string; etag: string } };

export type RemoveBlockingMutationVariables = Exact<{
  id: string;
  targetId: string;
}>;

export type RemoveBlockingMutation = { removeBlocking: { id: string; etag: string } };

export type AddBlockedByMutationVariables = Exact<{
  id: string;
  targetId: string;
}>;

export type AddBlockedByMutation = { addBlockedBy: { id: string; etag: string } };

export type RemoveBlockedByMutationVariables = Exact<{
  id: string;
  targetId: string;
}>;

export type RemoveBlockedByMutation = { removeBlockedBy: { id: string; etag: string } };
