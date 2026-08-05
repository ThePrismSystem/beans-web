import { BEAN_PRIORITIES, BEAN_STATUSES, BEAN_TYPES } from "@beans-web/shared";
import { useState } from "react";

import { CheckboxMenu } from "./CheckboxMenu.js";

import type { BeanFilterInput } from "../lib/filter.js";
import type { ChangeEvent } from "react";

export interface FilterBarProps {
  filter: BeanFilterInput;
  prefixOptions: string[];
  onChange: (filter: BeanFilterInput) => void;
}

const toOptions = <T extends string>(values: readonly T[]) =>
  values.map((value) => ({ value, label: value }));

export function FilterBar({ filter, prefixOptions, onChange }: FilterBarProps) {
  const [showFilters, setShowFilters] = useState(false);

  const activeCount =
    filter.type.length +
    filter.status.length +
    filter.priority.length +
    filter.prefix.length +
    filter.tags.length;

  function handleTags(event: ChangeEvent<HTMLInputElement>) {
    const tags = event.target.value
      .split(",")
      .map((t) => t.trim())
      .filter((t) => t.length > 0);
    onChange({ ...filter, tags });
  }

  return (
    <div className={`filter-bar ${showFilters ? "filter-bar--open" : ""}`}>
      <input
        type="search"
        className="filter-search"
        placeholder="Search beans…"
        aria-label="Search beans"
        value={filter.search}
        onChange={(e) => {
          onChange({ ...filter, search: e.target.value });
        }}
      />
      <button
        type="button"
        className="filter-toggle"
        aria-expanded={showFilters}
        onClick={() => {
          setShowFilters((o) => !o);
        }}
      >
        Filters{activeCount > 0 ? ` (${String(activeCount)})` : ""}
      </button>
      <div className="filter-bar-advanced">
        <CheckboxMenu
          label="Type"
          options={toOptions(BEAN_TYPES)}
          selected={filter.type}
          onChange={(type) => {
            onChange({ ...filter, type });
          }}
        />
        <CheckboxMenu
          label="Status"
          options={toOptions(BEAN_STATUSES)}
          selected={filter.status}
          onChange={(status) => {
            onChange({ ...filter, status });
          }}
        />
        <CheckboxMenu
          label="Priority"
          options={toOptions(BEAN_PRIORITIES)}
          selected={filter.priority}
          onChange={(priority) => {
            onChange({ ...filter, priority });
          }}
        />
        <CheckboxMenu
          label="Prefix"
          options={toOptions(prefixOptions)}
          selected={filter.prefix}
          onChange={(prefix) => {
            onChange({ ...filter, prefix });
          }}
        />
        <input
          type="text"
          className="filter-tags"
          placeholder="Tags…"
          aria-label="Tags"
          value={filter.tags.join(", ")}
          onChange={handleTags}
        />
      </div>
    </div>
  );
}
