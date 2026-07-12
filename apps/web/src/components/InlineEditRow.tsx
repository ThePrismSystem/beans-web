import { useState } from "react";

import type { ReactNode } from "react";

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
      <span className="inline-edit-value">
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
