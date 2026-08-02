import { useEffect, useRef, useState } from "react";

import type { ReactNode } from "react";

const EDITOR_SELECTOR = "select, input, textarea";

export interface InlineEditRowProps {
  label: string;
  display: ReactNode;
  editor: (args: { value: string; onValue: (v: string) => void }) => ReactNode;
  initialValue: string;
  onSave: (value: string) => void;
}

export function InlineEditRow({
  label,
  display,
  editor,
  initialValue,
  onSave,
}: InlineEditRowProps) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(initialValue);
  const valueRef = useRef<HTMLSpanElement>(null);
  const pencilRef = useRef<HTMLButtonElement>(null);
  const wasEditingRef = useRef(false);

  // Entering and leaving edit mode swaps the controls out of the DOM, which
  // drops focus onto <body> — a keyboard user loses their place in the page on
  // every edit, on the view where most editing happens. Focus follows the swap
  // instead: into the editor on open, back to the pencil on save or cancel
  // (WCAG 2.4.3).
  useEffect(() => {
    if (editing) {
      valueRef.current?.querySelector<HTMLElement>(EDITOR_SELECTOR)?.focus();
    } else if (wasEditingRef.current) {
      pencilRef.current?.focus();
    }
    wasEditingRef.current = editing;
  }, [editing]);

  function startEdit() {
    setValue(initialValue);
    setEditing(true);
  }

  function cancel() {
    setEditing(false);
    setValue(initialValue);
  }

  function save() {
    setEditing(false);
    if (value !== initialValue) {
      onSave(value);
    }
  }

  const dirty = value !== initialValue;

  return (
    <div className="inline-edit-row">
      <span className="inline-edit-label">{label}</span>
      <span className="inline-edit-value" ref={valueRef}>
        {editing ? (
          <>
            {editor({ value, onValue: setValue })}
            {dirty && (
              <button
                type="button"
                className="inline-edit-save"
                aria-label={`Save ${label}`}
                onClick={save}
              >
                ✔
              </button>
            )}
            <button
              type="button"
              className="inline-edit-cancel"
              aria-label={`Cancel ${label} edit`}
              onClick={cancel}
            >
              ✕
            </button>
          </>
        ) : (
          <>
            {display}
            <button
              type="button"
              ref={pencilRef}
              className="inline-edit-pencil"
              aria-label={`Edit ${label}`}
              onClick={startEdit}
            >
              ✎
            </button>
          </>
        )}
      </span>
    </div>
  );
}
