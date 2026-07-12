import { useEffect, useState } from "react";

import { BEAN_STATUSES, BEAN_TYPES, OPEN_STATUSES } from "@beans-frontend/shared";

import { BeanTypeTag } from "./BeanTypeTag.js";
import { CheckboxMenu } from "./CheckboxMenu.js";
import { StatusDot } from "./StatusDot.js";
import { beanPrefix, distinctPrefixes } from "../lib/prefix.js";

import type { Bean, BeanStatus, BeanType } from "@beans-frontend/shared";

export interface BeanPickerProps {
  open: boolean;
  title: string;
  candidates: Bean[];
  mode: "single" | "multi";
  allowNone?: boolean;
  onPick: (ids: string[]) => void;
  onClose: () => void;
}

function toOptions<T extends string>(values: readonly T[]) {
  return values.map((value) => ({ value, label: value }));
}

export function BeanPicker({
  open,
  title,
  candidates,
  mode,
  allowNone,
  onPick,
  onClose,
}: BeanPickerProps) {
  const [search, setSearch] = useState("");
  const [types, setTypes] = useState<BeanType[]>([]);
  const [statuses, setStatuses] = useState<BeanStatus[]>([...OPEN_STATUSES]);
  const [prefixes, setPrefixes] = useState<string[]>([]);
  const [checked, setChecked] = useState<string[]>([]);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  // RelationEditor keeps its BeanPicker instances always mounted and toggles
  // `open` instead of unmounting, so transient selection/filter state has to
  // be reset explicitly on each closed→open transition. Without this, a
  // previous multi-select stays checked after "Add" dispatches and closes
  // the picker, and reopening lets that stale checked set be re-dispatched.
  useEffect(() => {
    if (open) {
      setChecked([]);
      setSearch("");
      setTypes([]);
      setStatuses([...OPEN_STATUSES]);
      setPrefixes([]);
    }
  }, [open]);

  if (!open) return null;

  const prefixOptions = distinctPrefixes(candidates);
  const term = search.trim().toLowerCase();
  const shown = candidates.filter((bean) => {
    if (types.length > 0 && !types.includes(bean.type)) return false;
    if (statuses.length > 0 && !statuses.includes(bean.status)) return false;
    if (prefixes.length > 0 && !prefixes.includes(beanPrefix(bean.id))) return false;
    if (term && !bean.title.toLowerCase().includes(term)) return false;
    return true;
  });

  function toggleChecked(id: string) {
    setChecked((current) =>
      current.includes(id) ? current.filter((existing) => existing !== id) : [...current, id],
    );
  }

  return (
    <div className="picker-backdrop" onClick={onClose}>
      <div
        className="picker"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="picker-head">
          <h2>{title}</h2>
          <button type="button" aria-label="Close" onClick={onClose}>
            ✕
          </button>
        </div>
        <input
          className="picker-search"
          type="search"
          placeholder="Search beans…"
          aria-label="Search beans"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <div className="picker-filters">
          <CheckboxMenu
            label="Type"
            options={toOptions(BEAN_TYPES)}
            selected={types}
            onChange={setTypes}
          />
          <CheckboxMenu
            label="Status"
            options={toOptions(BEAN_STATUSES)}
            selected={statuses}
            onChange={setStatuses}
          />
          <CheckboxMenu
            label="Prefix"
            options={toOptions(prefixOptions)}
            selected={prefixes}
            onChange={setPrefixes}
          />
        </div>
        <div className="picker-list">
          {mode === "single" && allowNone && (
            <button type="button" className="picker-none" onClick={() => onPick([])}>
              — (none) —
            </button>
          )}
          {shown.map((bean) =>
            mode === "single" ? (
              <button
                key={bean.id}
                type="button"
                className="picker-row"
                onClick={() => onPick([bean.id])}
              >
                <BeanTypeTag type={bean.type} />
                <span className="picker-row-title">{bean.title}</span>
                <StatusDot status={bean.status} />
              </button>
            ) : (
              <label key={bean.id} className="picker-row">
                <input
                  type="checkbox"
                  aria-label={`Select ${bean.title}`}
                  checked={checked.includes(bean.id)}
                  onChange={() => toggleChecked(bean.id)}
                />
                <BeanTypeTag type={bean.type} />
                <span className="picker-row-title">{bean.title}</span>
                <StatusDot status={bean.status} />
              </label>
            ),
          )}
        </div>
        {mode === "multi" && (
          <div className="picker-foot">
            <button
              type="button"
              className="picker-add"
              disabled={checked.length === 0}
              onClick={() => onPick(checked)}
            >
              Add {checked.length}
            </button>
            <button type="button" onClick={onClose}>
              Cancel
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
