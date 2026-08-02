import { Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";

import { useDebouncedValue } from "../hooks/useDebouncedValue.js";
import { useSearch } from "../hooks/useSearch.js";
import { BeanTypeTag } from "./BeanTypeTag.js";
import { StatusDot } from "./StatusDot.js";

const SEARCH_DEBOUNCE_MS = 200;
const MAX_DROPDOWN = 8;
const LISTBOX_ID = "header-search-listbox";
const optionId = (index: number) => `header-search-option-${index}`;

export function HeaderSearch() {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
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

  // Any keystroke invalidates the highlight. Keyed on the raw query rather
  // than the debounced one so the highlight can't point at a stale row during
  // the debounce window.
  useEffect(() => {
    setActiveIndex(-1);
  }, [query]);

  const active = showDropdown && activeIndex >= 0 ? hits[activeIndex] : undefined;

  function move(delta: number) {
    if (!showDropdown) return;
    setActiveIndex((current) => {
      const next = current + delta;
      if (next < 0) return hits.length - 1;
      if (next >= hits.length) return 0;
      return next;
    });
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        move(1);
        break;
      case "ArrowUp":
        event.preventDefault();
        move(-1);
        break;
      case "Home":
        if (showDropdown) {
          event.preventDefault();
          setActiveIndex(0);
        }
        break;
      case "End":
        if (showDropdown) {
          event.preventDefault();
          setActiveIndex(hits.length - 1);
        }
        break;
      case "Enter": {
        setOpen(false);
        // A highlighted result wins; otherwise Enter runs the full search.
        if (active) {
          void navigate({
            to: "/p/$project/$beanId",
            params: { project: active.project, beanId: active.bean.id },
          });
          return;
        }
        const trimmed = query.trim();
        if (trimmed.length > 0) {
          void navigate({ to: "/search", search: { q: trimmed } });
        }
        break;
      }
      case "Escape":
        setOpen(false);
        setActiveIndex(-1);
        break;
    }
  }

  return (
    <div className="header-search" ref={rootRef} role="search" aria-label="Global search">
      <input
        className="header-search-input"
        type="search"
        placeholder="Search beans…"
        aria-label="Search all beans"
        role="combobox"
        aria-expanded={showDropdown}
        aria-controls={LISTBOX_ID}
        aria-autocomplete="list"
        aria-activedescendant={active ? optionId(activeIndex) : undefined}
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={handleKeyDown}
      />
      {/* Announces the result count, which sighted users read off the dropdown. */}
      <span className="visually-hidden" role="status">
        {debounced.length > 0 ? `${hits.length} results` : ""}
      </span>
      {showDropdown && (
        <div
          className="header-search-dropdown"
          id={LISTBOX_ID}
          role="listbox"
          aria-label="Search results"
        >
          {hits.map((hit, index) => (
            <Link
              key={`${hit.project}:${hit.bean.id}`}
              to="/p/$project/$beanId"
              params={{ project: hit.project, beanId: hit.bean.id }}
              className={`header-search-hit ${index === activeIndex ? "active" : ""}`}
              id={optionId(index)}
              role="option"
              aria-selected={index === activeIndex}
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
