import { Link, useSearch as useRouteSearch } from "@tanstack/react-router";
import { useState } from "react";

import { BeanTypeTag } from "../components/BeanTypeTag.js";
import { StatusDot } from "../components/StatusDot.js";
import { useDebouncedValue } from "../hooks/useDebouncedValue.js";
import { useDocumentTitle } from "../hooks/useDocumentTitle.js";
import { useSearch } from "../hooks/useSearch.js";

import type { SearchHit } from "@beans-web/shared";
import type { ChangeEvent } from "react";

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
  useDocumentTitle(query.trim() ? `Search: ${query.trim()}` : "Search");

  // SearchPage never writes to the URL itself (only header-search Enter
  // does), so it's safe to resync from the route whenever ?q= changes while
  // this page stays mounted, e.g. navigating here again from the header
  // search with a new query. Adjusted during render (not an effect) so the
  // resync lands in the same commit as the route change.
  const [previousRouteQuery, setPreviousRouteQuery] = useState(routeSearch.q);
  if (routeSearch.q !== previousRouteQuery) {
    setPreviousRouteQuery(routeSearch.q);
    setQuery(routeSearch.q ?? "");
  }

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
      return (
        <p className="muted" role="alert">
          Search failed.
        </p>
      );
    }
    if (isPending) {
      return (
        <p className="muted" role="status">
          Searching…
        </p>
      );
    }
    return (
      <>
        {data.failures.length > 0 && (
          <p className="search-warning" role="status">
            Some projects failed to search: {data.failures.join(", ")}. Results may be incomplete.
          </p>
        )}
        {data.hits.length === 0 ? (
          <p className="muted" role="status">
            No beans match &quot;{trimmed}&quot;.
          </p>
        ) : (
          <>
            {/* The header-search dropdown already announces its result count;
                this page said nothing. Visible as well as announced — the
                number is useful to everyone, not only to a screen reader. */}
            <p className="search-count" role="status">
              {data.hits.length} {data.hits.length === 1 ? "result" : "results"}
            </p>
            <div className="bean-list">
              {data.hits.map((hit) => (
                <SearchResultRow key={`${hit.project}:${hit.bean.id}`} hit={hit} />
              ))}
            </div>
          </>
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
