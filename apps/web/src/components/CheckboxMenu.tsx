import { useEffect, useRef, useState } from "react";

export interface CheckboxMenuProps<T extends string> {
  label: string;
  options: { value: T; label: string }[];
  selected: T[];
  onChange: (next: T[]) => void;
}

export function CheckboxMenu<T extends string>({
  label,
  options,
  selected,
  onChange,
}: CheckboxMenuProps<T>) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDoc(event: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function toggle(value: T) {
    onChange(selected.includes(value) ? selected.filter((v) => v !== value) : [...selected, value]);
  }

  return (
    <div className="checkbox-menu" ref={rootRef}>
      <button
        type="button"
        className={`checkbox-menu-trigger ${selected.length > 0 ? "active" : ""}`}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        {label}
        {selected.length > 0 ? ` (${selected.length})` : ""} ▾
      </button>
      {open && (
        <div className="checkbox-menu-list" role="group" aria-label={label}>
          {options.map((option) => (
            <label key={option.value} className="checkbox-menu-item">
              <input
                type="checkbox"
                checked={selected.includes(option.value)}
                onChange={() => toggle(option.value)}
              />
              {option.label}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
