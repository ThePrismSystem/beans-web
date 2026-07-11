import { useState } from "react";

import { canParent, validParentTypes } from "@beans-frontend/shared";

import type { ChangeEvent } from "react";
import type { Bean } from "@beans-frontend/shared";

export type RelationChange =
  | { kind: "setParent"; parentId: string | null }
  | { kind: "addBlocking"; targetId: string }
  | { kind: "removeBlocking"; targetId: string }
  | { kind: "addBlockedBy"; targetId: string }
  | { kind: "removeBlockedBy"; targetId: string };

export interface RelationEditorProps {
  bean: Bean;
  candidates: Bean[];
  onChange: (change: RelationChange) => void;
}

function titleFor(candidates: Bean[], id: string): string {
  return candidates.find((candidate) => candidate.id === id)?.title ?? id;
}

interface LinkListProps {
  label: string;
  ids: string[];
  candidates: Bean[];
  addLabel: string;
  options: Bean[];
  onAdd: (targetId: string) => void;
  onRemove: (targetId: string) => void;
}

function LinkList({ label, ids, candidates, addLabel, options, onAdd, onRemove }: LinkListProps) {
  const [selected, setSelected] = useState("");

  function handleAddChange(event: ChangeEvent<HTMLSelectElement>) {
    const targetId = event.target.value;
    if (targetId) {
      onAdd(targetId);
    }
    setSelected("");
  }

  return (
    <div className="relation-editor-section">
      <h3 className="relation-editor-label">{label}</h3>
      <ul className="relation-editor-list">
        {ids.map((id) => (
          <li key={id} className="relation-editor-item">
            <span>{titleFor(candidates, id)}</span>
            <button
              type="button"
              className="relation-editor-remove"
              aria-label={`Remove ${titleFor(candidates, id)} from ${label.toLowerCase()}`}
              onClick={() => onRemove(id)}
            >
              Remove
            </button>
          </li>
        ))}
      </ul>
      {options.length > 0 && (
        <select aria-label={addLabel} value={selected} onChange={handleAddChange}>
          <option value="">{addLabel}</option>
          {options.map((option) => (
            <option key={option.id} value={option.id}>
              {option.title}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}

export function RelationEditor({ bean, candidates, onChange }: RelationEditorProps) {
  const parentTypes = validParentTypes(bean.type);
  const parentOptions = candidates.filter(
    (candidate) => candidate.id !== bean.id && canParent(bean.type, candidate.type),
  );

  function handleParentChange(event: ChangeEvent<HTMLSelectElement>) {
    onChange({ kind: "setParent", parentId: event.target.value || null });
  }

  const blockingOptions = candidates.filter(
    (candidate) => candidate.id !== bean.id && !bean.blockingIds.includes(candidate.id),
  );
  const blockedByOptions = candidates.filter(
    (candidate) => candidate.id !== bean.id && !bean.blockedByIds.includes(candidate.id),
  );

  return (
    <div className="relation-editor">
      {parentTypes !== null && (
        <div className="relation-editor-section">
          <h3 className="relation-editor-label">Parent</h3>
          <select aria-label="Parent" value={bean.parentId ?? ""} onChange={handleParentChange}>
            <option value="">(none)</option>
            {parentOptions.map((option) => (
              <option key={option.id} value={option.id}>
                {option.title}
              </option>
            ))}
          </select>
        </div>
      )}
      <LinkList
        label="Blocks"
        ids={bean.blockingIds}
        candidates={candidates}
        addLabel="Add to blocks"
        options={blockingOptions}
        onAdd={(targetId) => onChange({ kind: "addBlocking", targetId })}
        onRemove={(targetId) => onChange({ kind: "removeBlocking", targetId })}
      />
      <LinkList
        label="Blocked by"
        ids={bean.blockedByIds}
        candidates={candidates}
        addLabel="Add to blocked by"
        options={blockedByOptions}
        onAdd={(targetId) => onChange({ kind: "addBlockedBy", targetId })}
        onRemove={(targetId) => onChange({ kind: "removeBlockedBy", targetId })}
      />
    </div>
  );
}
