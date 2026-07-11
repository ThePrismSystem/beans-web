export type Maybe<T> = T | null;
export type InputMaybe<T> = Maybe<T>;
export type Exact<T extends { [key: string]: unknown }> = { [K in keyof T]: T[K] };
export type MakeOptional<T, K extends keyof T> = Omit<T, K> & { [SubKey in K]?: Maybe<T[SubKey]> };
export type MakeMaybe<T, K extends keyof T> = Omit<T, K> & { [SubKey in K]: Maybe<T[SubKey]> };
export type MakeEmpty<T extends { [key: string]: unknown }, K extends keyof T> = {
  [_ in K]?: never;
};
export type Incremental<T> =
  T | { [P in keyof T]?: P extends " $fragmentName" | "__typename" ? T[P] : never };
/** All built-in and custom scalars, mapped to their actual values */
export type Scalars = {
  ID: { input: string; output: string };
  String: { input: string; output: string };
  Boolean: { input: boolean; output: boolean };
  Int: { input: number; output: number };
  Float: { input: number; output: number };
  Time: { input: string; output: string };
};

/** A bean represents an issue/task in the beans tracker */
export type Bean = {
  __typename?: "Bean";
  /** Beans that block this one (incoming blocking links) */
  blockedBy: Array<Bean>;
  /** IDs of beans that are blocking this bean (direct field) */
  blockedByIds: Array<Scalars["String"]["output"]>;
  /** Beans this one is blocking (resolved from blockingIds) */
  blocking: Array<Bean>;
  /** IDs of beans this bean is blocking */
  blockingIds: Array<Scalars["String"]["output"]>;
  /** Markdown body content */
  body: Scalars["String"]["output"];
  /** Child beans (beans with this as parent) */
  children: Array<Bean>;
  /** Creation timestamp */
  createdAt: Scalars["Time"]["output"];
  /** Content hash for optimistic concurrency control */
  etag: Scalars["String"]["output"];
  /** Unique identifier (NanoID) */
  id: Scalars["ID"]["output"];
  /** Parent bean (resolved from parentId) */
  parent: Maybe<Bean>;
  /** Parent bean ID (optional, type-restricted) */
  parentId: Maybe<Scalars["String"]["output"]>;
  /** Relative path from .beans/ directory */
  path: Scalars["String"]["output"];
  /** Priority level (critical, high, normal, low, deferred) */
  priority: Scalars["String"]["output"];
  /** Human-readable slug from filename */
  slug: Maybe<Scalars["String"]["output"]>;
  /** Current status (draft, todo, in-progress, completed, scrapped) */
  status: Scalars["String"]["output"];
  /** Tags for categorization */
  tags: Array<Scalars["String"]["output"]>;
  /** Bean title */
  title: Scalars["String"]["output"];
  /** Bean type (milestone, epic, bug, feature, task) */
  type: Scalars["String"]["output"];
  /** Last update timestamp */
  updatedAt: Scalars["Time"]["output"];
};

/** A bean represents an issue/task in the beans tracker */
export type BeanBlockedByArgs = {
  filter: InputMaybe<BeanFilter>;
};

/** A bean represents an issue/task in the beans tracker */
export type BeanBlockingArgs = {
  filter: InputMaybe<BeanFilter>;
};

/** A bean represents an issue/task in the beans tracker */
export type BeanChildrenArgs = {
  filter: InputMaybe<BeanFilter>;
};

/** Filter options for querying beans */
export type BeanFilter = {
  /** Include only beans blocked by this specific bean ID (via blocked_by field) */
  blockedById: InputMaybe<Scalars["String"]["input"]>;
  /** Include only beans that are blocking this specific bean ID */
  blockingId: InputMaybe<Scalars["String"]["input"]>;
  /** Exclude beans with these priorities */
  excludePriority: InputMaybe<Array<Scalars["String"]["input"]>>;
  /** Exclude beans with these statuses */
  excludeStatus: InputMaybe<Array<Scalars["String"]["input"]>>;
  /** Exclude beans with any of these tags */
  excludeTags: InputMaybe<Array<Scalars["String"]["input"]>>;
  /** Exclude beans with these types */
  excludeType: InputMaybe<Array<Scalars["String"]["input"]>>;
  /** Include only beans that have explicit blocked-by entries */
  hasBlockedBy: InputMaybe<Scalars["Boolean"]["input"]>;
  /** Include only beans that are blocking other beans */
  hasBlocking: InputMaybe<Scalars["Boolean"]["input"]>;
  /** Include only beans with a parent */
  hasParent: InputMaybe<Scalars["Boolean"]["input"]>;
  /** Include only beans that are blocked by others (via incoming blocking links or blocked_by field) */
  isBlocked: InputMaybe<Scalars["Boolean"]["input"]>;
  /** Exclude beans that have explicit blocked-by entries */
  noBlockedBy: InputMaybe<Scalars["Boolean"]["input"]>;
  /** Exclude beans that are blocking other beans */
  noBlocking: InputMaybe<Scalars["Boolean"]["input"]>;
  /** Exclude beans that have a parent */
  noParent: InputMaybe<Scalars["Boolean"]["input"]>;
  /** Include only beans with this specific parent ID */
  parentId: InputMaybe<Scalars["String"]["input"]>;
  /** Include only beans with these priorities (OR logic) */
  priority: InputMaybe<Array<Scalars["String"]["input"]>>;
  /**
   * Full-text search across slug, title, and body using Bleve query syntax.
   *
   * Examples:
   * - "login" - exact term match
   * - "login~" - fuzzy match (1 edit distance)
   * - "login~2" - fuzzy match (2 edit distance)
   * - "log*" - wildcard prefix
   * - "\"user login\"" - exact phrase
   * - "user AND login" - both terms required
   * - "user OR login" - either term
   * - "slug:auth" - search only slug field
   * - "title:login" - search only title field
   * - "body:auth" - search only body field
   */
  search: InputMaybe<Scalars["String"]["input"]>;
  /** Include only beans with these statuses (OR logic) */
  status: InputMaybe<Array<Scalars["String"]["input"]>>;
  /** Include only beans with any of these tags (OR logic) */
  tags: InputMaybe<Array<Scalars["String"]["input"]>>;
  /** Include only beans with these types (OR logic) */
  type: InputMaybe<Array<Scalars["String"]["input"]>>;
};

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
  append: InputMaybe<Scalars["String"]["input"]>;
  /**
   * Text replacements applied sequentially in array order.
   * Each old text must match exactly once at the time it's applied.
   */
  replace: InputMaybe<Array<ReplaceOperation>>;
};

/** Input for creating a new bean */
export type CreateBeanInput = {
  /** Bean IDs that are blocking this bean */
  blockedBy: InputMaybe<Array<Scalars["String"]["input"]>>;
  /** Bean IDs this bean is blocking */
  blocking: InputMaybe<Array<Scalars["String"]["input"]>>;
  /** Markdown body content */
  body: InputMaybe<Scalars["String"]["input"]>;
  /** Parent bean ID (validated against type hierarchy) */
  parent: InputMaybe<Scalars["String"]["input"]>;
  /** Custom ID prefix (overrides config prefix for this bean) */
  prefix: InputMaybe<Scalars["String"]["input"]>;
  /** Priority level (defaults to 'normal') */
  priority: InputMaybe<Scalars["String"]["input"]>;
  /** Status (defaults to 'todo') */
  status: InputMaybe<Scalars["String"]["input"]>;
  /** Tags for categorization */
  tags: InputMaybe<Array<Scalars["String"]["input"]>>;
  /** Bean title (required) */
  title: Scalars["String"]["input"];
  /** Bean type (defaults to 'task') */
  type: InputMaybe<Scalars["String"]["input"]>;
};

export type Mutation = {
  __typename?: "Mutation";
  /** Add a bean to the blocked-by list (this bean is blocked by targetId) */
  addBlockedBy: Bean;
  /** Add a bean to the blocking list */
  addBlocking: Bean;
  /** Create a new bean */
  createBean: Bean;
  /** Delete a bean by ID (automatically removes incoming links) */
  deleteBean: Scalars["Boolean"]["output"];
  /** Remove a bean from the blocked-by list */
  removeBlockedBy: Bean;
  /** Remove a bean from the blocking list */
  removeBlocking: Bean;
  /** Set or clear the parent of a bean (validates type hierarchy) */
  setParent: Bean;
  /** Update an existing bean */
  updateBean: Bean;
};

export type MutationAddBlockedByArgs = {
  id: Scalars["ID"]["input"];
  ifMatch: InputMaybe<Scalars["String"]["input"]>;
  targetId: Scalars["ID"]["input"];
};

export type MutationAddBlockingArgs = {
  id: Scalars["ID"]["input"];
  ifMatch: InputMaybe<Scalars["String"]["input"]>;
  targetId: Scalars["ID"]["input"];
};

export type MutationCreateBeanArgs = {
  input: CreateBeanInput;
};

export type MutationDeleteBeanArgs = {
  id: Scalars["ID"]["input"];
};

export type MutationRemoveBlockedByArgs = {
  id: Scalars["ID"]["input"];
  ifMatch: InputMaybe<Scalars["String"]["input"]>;
  targetId: Scalars["ID"]["input"];
};

export type MutationRemoveBlockingArgs = {
  id: Scalars["ID"]["input"];
  ifMatch: InputMaybe<Scalars["String"]["input"]>;
  targetId: Scalars["ID"]["input"];
};

export type MutationSetParentArgs = {
  id: Scalars["ID"]["input"];
  ifMatch: InputMaybe<Scalars["String"]["input"]>;
  parentId: InputMaybe<Scalars["String"]["input"]>;
};

export type MutationUpdateBeanArgs = {
  id: Scalars["ID"]["input"];
  input: UpdateBeanInput;
};

export type Query = {
  __typename?: "Query";
  /** Get a single bean by ID. Accepts either the full ID (e.g., "beans-abc1") or the short ID without prefix (e.g., "abc1"). */
  bean: Maybe<Bean>;
  /** List beans with optional filtering */
  beans: Array<Bean>;
};

export type QueryBeanArgs = {
  id: Scalars["ID"]["input"];
};

export type QueryBeansArgs = {
  filter: InputMaybe<BeanFilter>;
};

/** A single text replacement operation. */
export type ReplaceOperation = {
  /** Replacement text (can be empty to delete the matched text) */
  new: Scalars["String"]["input"];
  /** Text to find (must occur exactly once, cannot be empty) */
  old: Scalars["String"]["input"];
};

/** Input for updating an existing bean */
export type UpdateBeanInput = {
  /** Add beans to blocked-by list (validates cycles and existence) */
  addBlockedBy: InputMaybe<Array<Scalars["String"]["input"]>>;
  /** Add beans to blocking list (validates cycles and existence) */
  addBlocking: InputMaybe<Array<Scalars["String"]["input"]>>;
  /** Add tags to existing list */
  addTags: InputMaybe<Array<Scalars["String"]["input"]>>;
  /** New body content (full replacement, mutually exclusive with bodyMod) */
  body: InputMaybe<Scalars["String"]["input"]>;
  /** Structured body modifications (mutually exclusive with body) */
  bodyMod: InputMaybe<BodyModification>;
  /** ETag for optimistic concurrency control (optional) */
  ifMatch: InputMaybe<Scalars["String"]["input"]>;
  /** Set parent bean ID (null/empty to clear, validates type hierarchy) */
  parent: InputMaybe<Scalars["String"]["input"]>;
  /** New priority */
  priority: InputMaybe<Scalars["String"]["input"]>;
  /** Remove beans from blocked-by list */
  removeBlockedBy: InputMaybe<Array<Scalars["String"]["input"]>>;
  /** Remove beans from blocking list */
  removeBlocking: InputMaybe<Array<Scalars["String"]["input"]>>;
  /** Remove tags from existing list */
  removeTags: InputMaybe<Array<Scalars["String"]["input"]>>;
  /** New status */
  status: InputMaybe<Scalars["String"]["input"]>;
  /** Replace all tags (nil preserves existing, mutually exclusive with addTags/removeTags) */
  tags: InputMaybe<Array<Scalars["String"]["input"]>>;
  /** New title */
  title: InputMaybe<Scalars["String"]["input"]>;
  /** New type */
  type: InputMaybe<Scalars["String"]["input"]>;
};

export type BeanDetailQueryVariables = Exact<{
  id: Scalars["ID"]["input"];
}>;

export type BeanDetailQuery = {
  __typename?: "Query";
  bean: {
    __typename?: "Bean";
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
    parent: { __typename?: "Bean"; id: string; title: string; type: string; status: string } | null;
    children: Array<{
      __typename?: "Bean";
      id: string;
      title: string;
      type: string;
      status: string;
    }>;
    blocking: Array<{
      __typename?: "Bean";
      id: string;
      title: string;
      type: string;
      status: string;
    }>;
    blockedBy: Array<{
      __typename?: "Bean";
      id: string;
      title: string;
      type: string;
      status: string;
    }>;
  } | null;
};
