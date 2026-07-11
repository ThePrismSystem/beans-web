import { Link } from "@tanstack/react-router";
import { useState } from "react";

import { BeanTypeTag } from "../components/BeanTypeTag.js";
import { StatusDot } from "../components/StatusDot.js";
import { useSearch } from "../hooks/useSearch.js";

import type { ChangeEvent } from "react";
import type { SearchHit } from "../api/client.js";

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
  const [query, setQuery] = useState("");
  const trimmed = query.trim();
  const { data: hits, isPending, isError } = useSearch(query);

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    setQuery(event.target.value);
  }

  function renderResults() {
    if (trimmed.length === 0) {
      return <p className="muted">Type to search beans across all projects.</p>;
    }
    if (isPending) {
      return <p className="muted">Searching…</p>;
    }
    if (isError) {
      return <p className="muted">Search failed.</p>;
    }
    if (hits.length === 0) {
      return <p className="muted">No beans match &quot;{trimmed}&quot;.</p>;
    }
    return (
      <div className="bean-list">
        {hits.map((hit) => (
          <SearchResultRow key={`${hit.project}:${hit.bean.id}`} hit={hit} />
        ))}
      </div>
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
