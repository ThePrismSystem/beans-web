import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";

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
  const [flip, setFlip] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listId = useId();

  useEffect(() => {
    if (!open) return;
    function onDoc(event: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // These menus sit in a wrapping row, so the last one can open near the right
  // margin and run off-screen. Measure once per open and anchor right instead.
  useLayoutEffect(() => {
    if (!open || !listRef.current) {
      setFlip(false);
      return;
    }
    const { left, width } = listRef.current.getBoundingClientRect();
    setFlip(width > 0 && left + width > document.documentElement.clientWidth);
  }, [open]);

  function toggle(value: T) {
    onChange(selected.includes(value) ? selected.filter((v) => v !== value) : [...selected, value]);
  }

  return (
    <div className="checkbox-menu" ref={rootRef}>
      <button
        type="button"
        ref={triggerRef}
        className={`checkbox-menu-trigger ${selected.length > 0 ? "active" : ""}`}
        aria-expanded={open}
        aria-haspopup="true"
        aria-controls={listId}
        onClick={() => setOpen((v) => !v)}
      >
        {label}
        {selected.length > 0 ? ` (${selected.length})` : ""} ▾
      </button>
      {open && (
        <div
          ref={listRef}
          id={listId}
          className={`checkbox-menu-list ${flip ? "checkbox-menu-list--flip-right" : ""}`}
          role="group"
          aria-label={label}
        >
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
