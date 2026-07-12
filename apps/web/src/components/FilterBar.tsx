import { BEAN_PRIORITIES, BEAN_STATUSES, BEAN_TYPES } from "@beans-frontend/shared";

import type { BeanFilterInput } from "../hooks/useBeans.js";
import type { ChangeEvent } from "react";

export interface FilterBarProps {
  filter: BeanFilterInput;
  onChange: (filter: BeanFilterInput) => void;
}

export function FilterBar({ filter, onChange }: FilterBarProps) {
  function handleTypeChange(event: ChangeEvent<HTMLSelectElement>) {
    const match = BEAN_TYPES.find((type) => type === event.target.value);
    onChange({ ...filter, type: match ? [match] : [] });
  }

  function handleStatusChange(event: ChangeEvent<HTMLSelectElement>) {
    const match = BEAN_STATUSES.find((status) => status === event.target.value);
    onChange({ ...filter, status: match ? [match] : [] });
  }

  function handlePriorityChange(event: ChangeEvent<HTMLSelectElement>) {
    const match = BEAN_PRIORITIES.find((priority) => priority === event.target.value);
    onChange({ ...filter, priority: match ? [match] : [] });
  }

  function handleTagsChange(event: ChangeEvent<HTMLInputElement>) {
    const tags = event.target.value
      .split(",")
      .map((tag) => tag.trim())
      .filter((tag) => tag.length > 0);
    onChange({ ...filter, tags });
  }

  function handleSearchChange(event: ChangeEvent<HTMLInputElement>) {
    onChange({ ...filter, search: event.target.value });
  }

  return (
    <div className="filter-bar">
      <input
        type="search"
        className="filter-search"
        placeholder="Search beans…"
        aria-label="Search beans"
        value={filter.search}
        onChange={handleSearchChange}
      />
      <select aria-label="Type" value={filter.type[0] ?? ""} onChange={handleTypeChange}>
        <option value="">All types</option>
        {BEAN_TYPES.map((type) => (
          <option key={type} value={type}>
            {type}
          </option>
        ))}
      </select>
      <select aria-label="Status" value={filter.status[0] ?? ""} onChange={handleStatusChange}>
        <option value="">All statuses</option>
        {BEAN_STATUSES.map((status) => (
          <option key={status} value={status}>
            {status}
          </option>
        ))}
      </select>
      <select
        aria-label="Priority"
        value={filter.priority[0] ?? ""}
        onChange={handlePriorityChange}
      >
        <option value="">All priorities</option>
        {BEAN_PRIORITIES.map((priority) => (
          <option key={priority} value={priority}>
            {priority}
          </option>
        ))}
      </select>
      <input
        type="text"
        className="filter-tags"
        placeholder="Tags (comma-separated)"
        aria-label="Tags"
        value={filter.tags.join(", ")}
        onChange={handleTagsChange}
      />
    </div>
  );
}
