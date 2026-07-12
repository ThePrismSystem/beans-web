import { useNavigate, useParams, useSearch } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";

import { FilterBar } from "../components/FilterBar.js";
import { FlatList } from "../components/FlatList.js";
import { HierarchyList } from "../components/HierarchyList.js";

import { DEFAULT_BEAN_FILTER, useBeans } from "../hooks/useBeans.js";
import { withAncestors } from "../lib/hierarchy.js";
import { beanPrefix, distinctPrefixes } from "../lib/prefix.js";

import { BEAN_PRIORITIES, BEAN_STATUSES, BEAN_TYPES } from "@beans-frontend/shared";

import type { BeanFilterInput } from "../hooks/useBeans.js";
import type { BeanPriority, BeanStatus, BeanType } from "@beans-frontend/shared";

export interface ProjectSearch {
  type?: BeanType[];
  status?: BeanStatus[];
  priority?: BeanPriority[];
  tags?: string[];
  prefix?: string[];
  search?: string;
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
  return result;
}

type ViewMode = "flat" | "hierarchy";

function viewStorageKey(project: string): string {
  return `beans:view:${project}`;
}

function loadViewMode(project: string): ViewMode {
  return window.localStorage.getItem(viewStorageKey(project)) === "flat" ? "flat" : "hierarchy";
}

export function ProjectList() {
  const { project } = useParams({ from: "/p/$project" });
  const search = useSearch({ from: "/p/$project" });
  const navigate = useNavigate({ from: "/p/$project" });
  const [view, setView] = useState<ViewMode>(() => loadViewMode(project));

  useEffect(() => {
    setView(loadViewMode(project));
  }, [project]);

  useEffect(() => {
    window.localStorage.setItem(viewStorageKey(project), view);
  }, [project, view]);

  const filter: BeanFilterInput = {
    type: search.type ?? [],
    // With no status param present, default to the open statuses so
    // completed/scrapped beans are hidden until explicitly requested.
    status: search.status ?? [...DEFAULT_BEAN_FILTER.status],
    priority: search.priority ?? [],
    tags: search.tags ?? [],
    prefix: search.prefix ?? [],
    search: search.search ?? "",
  };

  // In hierarchy view the type filter is applied client-side (see
  // HierarchyList's `typeFilter` prop) so that ancestor milestones/epics
  // stay visible as section context even when they don't themselves match
  // the filtered type. Sending the type filter to the server would strip
  // those ancestors from the response and buildTree would have nothing to
  // nest the matches under, collapsing the tree into a flat list. Status,
  // priority, tags, and search stay server-side for both views. Prefix is
  // always applied client-side (see below), so it is never sent to the
  // server either.
  const serverFilter: BeanFilterInput =
    view === "hierarchy" ? { ...filter, type: [], prefix: [] } : { ...filter, prefix: [] };

  const { data: beans, isPending, isError } = useBeans(project, serverFilter);
  const prefixOptions = beans ? distinctPrefixes(beans) : [];

  function handleFilterChange(next: BeanFilterInput) {
    void navigate({
      search: {
        type: next.type.length > 0 ? next.type : undefined,
        status: next.status.length > 0 ? next.status : undefined,
        priority: next.priority.length > 0 ? next.priority : undefined,
        tags: next.tags.length > 0 ? next.tags : undefined,
        prefix: next.prefix.length > 0 ? next.prefix : undefined,
        search: next.search.length > 0 ? next.search : undefined,
      },
    });
  }

  // Keep ancestor sections visible when pruning by prefix in hierarchy view
  // (mirrors the type-filter pattern above): a matched bean's milestone/epic
  // ancestors are kept even though they don't themselves match the prefix,
  // so buildTree still has somewhere to nest the matches.
  //
  // Both memoized on `beans`/`filter.prefix` (not recomputed on every
  // render) so HierarchyList's `beans` prop keeps a stable identity across
  // re-renders that don't actually change the filtered data (e.g. an SSE
  // "Updated" event elsewhere causing this component to re-render). A new
  // array identity on every render would trip HierarchyList's collapse
  // re-seed and wipe the user's expand/collapse state.
  const prefixFiltered = useMemo(
    () =>
      beans && filter.prefix.length > 0
        ? beans.filter((b) => filter.prefix.includes(beanPrefix(b.id)))
        : beans,
    [beans, filter.prefix],
  );
  const hierarchyBeans = useMemo(
    () =>
      beans && prefixFiltered && filter.prefix.length > 0
        ? withAncestors(prefixFiltered, beans)
        : beans,
    [beans, prefixFiltered, filter.prefix.length],
  );

  function renderList() {
    if (isPending) {
      return <p className="muted">Loading beans…</p>;
    }
    if (isError) {
      return <p className="muted">Failed to load beans.</p>;
    }
    if (!prefixFiltered) {
      return null;
    }
    if (prefixFiltered.length === 0) {
      return <p className="muted">No beans match the current filters.</p>;
    }
    if (view === "flat") {
      return <FlatList project={project} beans={prefixFiltered} />;
    }
    return (
      <HierarchyList
        project={project}
        beans={hierarchyBeans ?? prefixFiltered}
        typeFilter={filter.type}
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
      {renderList()}
    </div>
  );
}
