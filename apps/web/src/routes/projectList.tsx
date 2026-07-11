import { useNavigate, useParams, useSearch } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { FilterBar } from "../components/FilterBar.js";
import { FlatList } from "../components/FlatList.js";
import { HierarchyList } from "../components/HierarchyList.js";

import { useBeans } from "../hooks/useBeans.js";

import { BEAN_PRIORITIES, BEAN_STATUSES, BEAN_TYPES } from "@beans-frontend/shared";

import type { BeanFilterInput } from "../hooks/useBeans.js";
import type { BeanPriority, BeanStatus, BeanType } from "@beans-frontend/shared";

export interface ProjectSearch {
  type?: BeanType[];
  status?: BeanStatus[];
  priority?: BeanPriority[];
  tags?: string[];
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
  if (type.length > 0) result.type = type;
  if (status.length > 0) result.status = status;
  if (priority.length > 0) result.priority = priority;
  if (tags.length > 0) result.tags = tags;
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
    status: search.status ?? [],
    priority: search.priority ?? [],
    tags: search.tags ?? [],
    search: search.search ?? "",
  };

  const { data: beans, isPending, isError } = useBeans(project, filter);

  function handleFilterChange(next: BeanFilterInput) {
    void navigate({
      search: {
        type: next.type.length > 0 ? next.type : undefined,
        status: next.status.length > 0 ? next.status : undefined,
        priority: next.priority.length > 0 ? next.priority : undefined,
        tags: next.tags.length > 0 ? next.tags : undefined,
        search: next.search.length > 0 ? next.search : undefined,
      },
    });
  }

  function renderList() {
    if (isPending) {
      return <p className="muted">Loading beans…</p>;
    }
    if (isError) {
      return <p className="muted">Failed to load beans.</p>;
    }
    if (beans.length === 0) {
      return <p className="muted">No beans match the current filters.</p>;
    }
    return view === "flat" ? (
      <FlatList project={project} beans={beans} />
    ) : (
      <HierarchyList project={project} beans={beans} />
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
      <FilterBar filter={filter} onChange={handleFilterChange} />
      {renderList()}
    </div>
  );
}
