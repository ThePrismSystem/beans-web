import { Link, useSearch as useRouteSearch } from "@tanstack/react-router";
import { useState } from "react";

import { BeanTypeTag } from "../components/BeanTypeTag.js";
import { StatusDot } from "../components/StatusDot.js";
import { useDebouncedValue } from "../hooks/useDebouncedValue.js";
import { useSearch } from "../hooks/useSearch.js";

import type { ChangeEvent } from "react";
import type { SearchHit } from "@beans-frontend/shared";

const SEARCH_DEBOUNCE_MS = 250;

function SearchResultRow({ hit }: { hit: SearchHit }) {
  return (
    <Link
      to="/p/$project/$beanId"
      params={{ project: hit.project, beanId: hit.bean.id }}
      className="bean-row"
    >
      <BeanTypeTag type={hit.bean.type} />
      <span className="bean-row-title">{hit.bean.title}</span>
      <span className="muted">{hit.project}</span>
      <StatusDot status={hit.bean.status} />
    </Link>
  );
}

export function SearchPage() {
  const routeSearch = useRouteSearch({ strict: false });
  const [query, setQuery] = useState(routeSearch.q ?? "");
  const trimmed = query.trim();
  const debounced = useDebouncedValue(trimmed, SEARCH_DEBOUNCE_MS);
  const { data, isPending, isError } = useSearch(debounced);

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    setQuery(event.target.value);
  }

  function renderResults() {
    if (trimmed.length === 0) {
      return <p className="muted">Type to search beans across all projects.</p>;
    }
    if (isError) {
      return <p className="muted">Search failed.</p>;
    }
    if (isPending || !data) {
      return <p className="muted">Searching…</p>;
    }
    return (
      <>
        {data.failures.length > 0 && (
          <p className="search-warning" role="status">
            Some projects failed to search: {data.failures.join(", ")}. Results may be incomplete.
          </p>
        )}
        {data.hits.length === 0 ? (
          <p className="muted">No beans match &quot;{trimmed}&quot;.</p>
        ) : (
          <div className="bean-list">
            {data.hits.map((hit) => (
              <SearchResultRow key={`${hit.project}:${hit.bean.id}`} hit={hit} />
            ))}
          </div>
        )}
      </>
    );
  }

  return (
    <div className="search-page">
      <h1>Search</h1>
      <input
        type="search"
        className="filter-search"
        placeholder="Search beans…"
        aria-label="Search beans"
        autoFocus
        value={query}
        onChange={handleChange}
      />
      {renderResults()}
    </div>
  );
}
