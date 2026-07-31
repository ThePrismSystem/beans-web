import { useNavigate, useParams, useSearch } from "@tanstack/react-router";
import { useMemo } from "react";

import { FilterBar } from "../components/FilterBar.js";
import { FlatList } from "../components/FlatList.js";
import { HierarchyList } from "../components/HierarchyList.js";

import { useProjectBeans } from "../hooks/useBeans.js";
import { usePersistedProjectState } from "../hooks/usePersistedState.js";
import { applyFilter, DEFAULT_BEAN_FILTER } from "../lib/filter.js";
import { withAncestors } from "../lib/hierarchy.js";
import { orphanedIds } from "../lib/orphan.js";
import { beanPrefix, distinctPrefixes } from "../lib/prefix.js";
import { readString, writeString } from "../lib/storage.js";
import { sortBeans } from "../lib/sort.js";

import { BEAN_PRIORITIES, BEAN_STATUSES, BEAN_TYPES } from "@beans-frontend/shared";

import type { BeanFilterInput } from "../lib/filter.js";
import type { SortDir, SortKey } from "../lib/sort.js";
import type { ChangeEvent } from "react";
import type { BeanPriority, BeanStatus, BeanType } from "@beans-frontend/shared";

const SORT_KEYS: readonly SortKey[] = ["type", "title", "status"];
const SORT_DIRS: readonly SortDir[] = ["asc", "desc"];

export interface ProjectSearch {
  type?: BeanType[];
  status?: BeanStatus[];
  priority?: BeanPriority[];
  tags?: string[];
  prefix?: string[];
  search?: string;
  sort?: SortKey;
  dir?: SortDir;
}

function toStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === "string");
  }
  if (typeof value === "string") {
    return [value];
  }
  return [];
}

function filterKnown<T extends string>(values: string[], known: readonly T[]): T[] {
  const knownStrings: readonly string[] = known;
  return values.filter((value): value is T => knownStrings.includes(value));
}

function isOneOf<T extends string>(value: unknown, known: readonly T[]): value is T {
  const knownStrings: readonly string[] = known;
  return typeof value === "string" && knownStrings.includes(value);
}

export function validateProjectSearch(search: Record<string, unknown>): ProjectSearch {
  const result: ProjectSearch = {};
  const type = filterKnown(toStringArray(search.type), BEAN_TYPES);
  const status = filterKnown(toStringArray(search.status), BEAN_STATUSES);
  const priority = filterKnown(toStringArray(search.priority), BEAN_PRIORITIES);
  const tags = toStringArray(search.tags);
  const prefix = toStringArray(search.prefix);
  if (type.length > 0) result.type = type;
  if (status.length > 0) result.status = status;
  if (priority.length > 0) result.priority = priority;
  if (tags.length > 0) result.tags = tags;
  if (prefix.length > 0) result.prefix = prefix;
  if (typeof search.search === "string" && search.search.length > 0) {
    result.search = search.search;
  }
  if (isOneOf(search.sort, SORT_KEYS)) {
    result.sort = search.sort;
  }
  if (isOneOf(search.dir, SORT_DIRS)) {
    result.dir = search.dir;
  }
  return result;
}

type ViewMode = "flat" | "hierarchy";

export function ProjectList() {
  const { project } = useParams({ from: "/p/$project" });
  const search = useSearch({ from: "/p/$project" });
  const navigate = useNavigate({ from: "/p/$project" });
  const [view, setView] = usePersistedProjectState<ViewMode>(
    project,
    "view",
    (key) => (readString(key) === "flat" ? "flat" : "hierarchy"),
    writeString,
  );

  // `search` is structurally memoized by TanStack Router, so this identity is
  // stable while the URL params are — which keeps every derived memo below
  // from recomputing on unrelated re-renders.
  const filter: BeanFilterInput = useMemo(
    () => ({
      type: search.type ?? [],
      // With no status param present, default to the open statuses so
      // completed/scrapped beans are hidden until explicitly requested.
      status: search.status ?? [...DEFAULT_BEAN_FILTER.status],
      priority: search.priority ?? [],
      tags: search.tags ?? [],
      prefix: search.prefix ?? [],
      search: search.search ?? "",
    }),
    [search],
  );

  const { data: allBeans, isPending, isError } = useProjectBeans(project, filter.search);
  const { data: fullBeans } = useProjectBeans(project, "");

  const prefixOptions = fullBeans ? distinctPrefixes(fullBeans) : [];

  // Orphan status is computed from the FULL project dataset, never the
  // search-narrowed one — a parent missing because it didn't match the search
  // text is not an orphaning parent, and the badge must agree with the
  // bean-detail page's own (always-unfiltered) orphan check.
  const orphaned = useMemo(() => orphanedIds(fullBeans ?? []), [fullBeans]);

  const knownIds = useMemo(() => new Set((fullBeans ?? []).map((bean) => bean.id)), [fullBeans]);

  const flatBeans = useMemo(
    () => (allBeans ? applyFilter(allBeans, filter) : []),
    [allBeans, filter],
  );

  // In hierarchy view the type filter is applied by HierarchyList's prune so
  // ancestor milestones/epics stay visible as section context, and the prefix
  // filter keeps ancestors via withAncestors for the same reason. Both are
  // therefore excluded here and reapplied inside the tree.
  const hierarchyBeans = useMemo(() => {
    if (!allBeans) return [];
    const base = applyFilter(allBeans, { ...filter, type: [], prefix: [] });
    if (filter.prefix.length === 0) return base;
    const matched = base.filter((bean) => filter.prefix.includes(beanPrefix(bean.id)));
    return withAncestors(matched, base);
  }, [allBeans, filter]);

  function handleFilterChange(next: BeanFilterInput) {
    void navigate({
      search: {
        type: next.type.length > 0 ? next.type : undefined,
        status: next.status.length > 0 ? next.status : undefined,
        priority: next.priority.length > 0 ? next.priority : undefined,
        tags: next.tags.length > 0 ? next.tags : undefined,
        prefix: next.prefix.length > 0 ? next.prefix : undefined,
        search: next.search.length > 0 ? next.search : undefined,
        sort: search.sort,
        dir: search.dir,
      },
    });
  }

  // Preserves the current filter params while updating the sort params, so
  // changing the sort never clobbers an active filter (mirrors
  // handleFilterChange, which preserves sort/dir the same way in reverse).
  function handleSortChange(sort: SortKey | undefined, dir: SortDir | undefined) {
    void navigate({
      search: {
        type: search.type,
        status: search.status,
        priority: search.priority,
        tags: search.tags,
        prefix: search.prefix,
        search: search.search,
        sort,
        dir,
      },
    });
  }

  function handleSortKeyChange(event: ChangeEvent<HTMLSelectElement>) {
    const key = isOneOf(event.target.value, SORT_KEYS) ? event.target.value : undefined;
    handleSortChange(key, key ? (search.dir ?? "asc") : undefined);
  }

  function handleSortDirToggle() {
    const nextDir: SortDir = (search.dir ?? "asc") === "asc" ? "desc" : "asc";
    handleSortChange(search.sort, nextDir);
  }

  function renderList() {
    if (isPending) {
      return <p className="muted">Loading beans…</p>;
    }
    if (isError) {
      return <p className="muted">Failed to load beans.</p>;
    }
    if (view === "flat") {
      if (flatBeans.length === 0) {
        return <p className="muted">No beans match the current filters.</p>;
      }
      return (
        <FlatList
          project={project}
          beans={sortBeans(flatBeans, search.sort, search.dir ?? "asc")}
          orphaned={orphaned}
        />
      );
    }
    if (hierarchyBeans.length === 0) {
      return <p className="muted">No beans match the current filters.</p>;
    }
    return (
      <HierarchyList
        project={project}
        beans={hierarchyBeans}
        orphaned={orphaned}
        knownIds={knownIds}
        typeFilter={filter.type}
        sort={search.sort}
        dir={search.dir}
      />
    );
  }

  return (
    <div className="project-list">
      <div className="project-list-header">
        <h1>{project}</h1>
        <div className="view-toggle" role="group" aria-label="List view">
          <button
            type="button"
            className={view === "hierarchy" ? "active" : ""}
            aria-pressed={view === "hierarchy"}
            onClick={() => {
              setView("hierarchy");
            }}
          >
            Hierarchy
          </button>
          <button
            type="button"
            className={view === "flat" ? "active" : ""}
            aria-pressed={view === "flat"}
            onClick={() => {
              setView("flat");
            }}
          >
            Flat
          </button>
        </div>
      </div>
      <FilterBar filter={filter} prefixOptions={prefixOptions} onChange={handleFilterChange} />
      <div className="sort-control">
        <label>
          Sort
          <select aria-label="Sort by" value={search.sort ?? ""} onChange={handleSortKeyChange}>
            <option value="">Default</option>
            <option value="type">Type</option>
            <option value="title">Title</option>
            <option value="status">Status</option>
          </select>
        </label>
        <button
          type="button"
          aria-label="Toggle sort direction"
          onClick={handleSortDirToggle}
          disabled={!search.sort}
        >
          {(search.dir ?? "asc") === "asc" ? "↑" : "↓"}
        </button>
      </div>
      {renderList()}
    </div>
  );
}
