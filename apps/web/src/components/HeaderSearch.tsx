import { Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";

import { useDebouncedValue } from "../hooks/useDebouncedValue.js";
import { useSearch } from "../hooks/useSearch.js";
import { BeanTypeTag } from "./BeanTypeTag.js";
import { StatusDot } from "./StatusDot.js";

const SEARCH_DEBOUNCE_MS = 200;
const MAX_DROPDOWN = 8;

export function HeaderSearch() {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const debounced = useDebouncedValue(query.trim(), SEARCH_DEBOUNCE_MS);
  const { data } = useSearch(debounced);

  useEffect(() => {
    function onDoc(event: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const hits = data?.hits.slice(0, MAX_DROPDOWN) ?? [];
  const showDropdown = open && debounced.length > 0 && hits.length > 0;

  return (
    <div className="header-search" ref={rootRef} role="search" aria-label="Global search">
      <input
        className="header-search-input"
        type="search"
        placeholder="Search beans…"
        aria-label="Search all beans"
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            const trimmed = query.trim();
            setOpen(false);
            if (trimmed.length > 0) {
              void navigate({ to: "/search", search: { q: trimmed } });
            }
          } else if (event.key === "Escape") {
            setOpen(false);
          }
        }}
      />
      {showDropdown && (
        <div className="header-search-dropdown">
          {hits.map((hit) => (
            <Link
              key={`${hit.project}:${hit.bean.id}`}
              to="/p/$project/$beanId"
              params={{ project: hit.project, beanId: hit.bean.id }}
              className="header-search-hit"
              onClick={() => setOpen(false)}
            >
              <BeanTypeTag type={hit.bean.type} />
              <span className="header-search-hit-title">{hit.bean.title}</span>
              <span className="muted">{hit.project}</span>
              <StatusDot status={hit.bean.status} />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
