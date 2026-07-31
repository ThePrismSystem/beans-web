import { useState } from "react";

import { canParent, validParentTypes } from "@beans-frontend/shared";

import { BeanPicker } from "./BeanPicker.js";

import type { Bean, BeanListItem } from "@beans-frontend/shared";

export type RelationChange =
  | { kind: "setParent"; parentId: string | null }
  | { kind: "addBlocking"; targetId: string }
  | { kind: "removeBlocking"; targetId: string }
  | { kind: "addBlockedBy"; targetId: string }
  | { kind: "removeBlockedBy"; targetId: string };

export interface RelationEditorProps {
  bean: Bean;
  candidates: BeanListItem[];
  onChange: (change: RelationChange) => void;
}

function titleFor(candidates: BeanListItem[], id: string): string {
  return candidates.find((candidate) => candidate.id === id)?.title ?? id;
}

type Picker = null | "parent" | "blocking" | "blockedBy";

export function RelationEditor({ bean, candidates, onChange }: RelationEditorProps) {
  const [picker, setPicker] = useState<Picker>(null);
  const parentTypes = validParentTypes(bean.type);

  const parentOptions = candidates.filter(
    (candidate) => candidate.id !== bean.id && canParent(bean.type, candidate.type),
  );
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
          <div className="relation-editor-current">
            {bean.parentId ? (
              titleFor(candidates, bean.parentId)
            ) : (
              <span className="muted">(none)</span>
            )}
          </div>
          <button type="button" onClick={() => setPicker("parent")}>
            Set parent
          </button>
          <BeanPicker
            open={picker === "parent"}
            title="Set parent"
            candidates={parentOptions}
            mode="single"
            allowNone
            onClose={() => setPicker(null)}
            onPick={(ids) => {
              setPicker(null);
              onChange({ kind: "setParent", parentId: ids[0] ?? null });
            }}
          />
        </div>
      )}

      <div className="relation-editor-section">
        <h3 className="relation-editor-label">Blocks</h3>
        <ul className="relation-editor-list">
          {bean.blockingIds.map((id) => (
            <li key={id} className="relation-editor-item">
              <span>{titleFor(candidates, id)}</span>
              <button
                type="button"
                className="relation-editor-remove"
                aria-label={`Remove ${titleFor(candidates, id)} from blocks`}
                onClick={() => onChange({ kind: "removeBlocking", targetId: id })}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
        <button type="button" onClick={() => setPicker("blocking")}>
          Add blocks
        </button>
        <BeanPicker
          open={picker === "blocking"}
          title="Add blocks"
          candidates={blockingOptions}
          mode="multi"
          onClose={() => setPicker(null)}
          onPick={(ids) => {
            setPicker(null);
            ids.forEach((targetId) => onChange({ kind: "addBlocking", targetId }));
          }}
        />
      </div>

      <div className="relation-editor-section">
        <h3 className="relation-editor-label">Blocked by</h3>
        <ul className="relation-editor-list">
          {bean.blockedByIds.map((id) => (
            <li key={id} className="relation-editor-item">
              <span>{titleFor(candidates, id)}</span>
              <button
                type="button"
                className="relation-editor-remove"
                aria-label={`Remove ${titleFor(candidates, id)} from blocked by`}
                onClick={() => onChange({ kind: "removeBlockedBy", targetId: id })}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
        <button type="button" onClick={() => setPicker("blockedBy")}>
          Add blocked by
        </button>
        <BeanPicker
          open={picker === "blockedBy"}
          title="Add blocked by"
          candidates={blockedByOptions}
          mode="multi"
          onClose={() => setPicker(null)}
          onPick={(ids) => {
            setPicker(null);
            ids.forEach((targetId) => onChange({ kind: "addBlockedBy", targetId }));
          }}
        />
      </div>
    </div>
  );
}
