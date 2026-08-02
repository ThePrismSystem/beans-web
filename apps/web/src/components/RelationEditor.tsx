import { Link } from "@tanstack/react-router";
import { useState } from "react";

import { canParent, validParentTypes } from "@beans-frontend/shared";

import { BeanPicker } from "./BeanPicker.js";
import { BeanTypeTag } from "./BeanTypeTag.js";

import type { BeanDetail, BeanListItem, LinkedBean } from "@beans-frontend/shared";

/**
 * Which bean's file declares an edge. beans stores a blocking link on whichever
 * side wrote it and never resolves the inverse, so removing an `inbound` edge
 * means mutating the *other* bean — see `RelationEditorProps.onChange`.
 */
export type RelationOrigin = "own" | "inbound";

export type RelationChange =
  | { kind: "setParent"; parentId: string | null }
  | { kind: "addBlocking"; targetId: string }
  | { kind: "removeBlocking"; targetId: string; origin: RelationOrigin }
  | { kind: "addBlockedBy"; targetId: string }
  | { kind: "removeBlockedBy"; targetId: string; origin: RelationOrigin };

export interface RelationEditorProps {
  project: string;
  bean: BeanDetail;
  candidates: BeanListItem[];
  /**
   * Removals carry the edge's `origin`. An `own` removal targets this bean's own
   * list; an `inbound` one only takes effect against the bean that declared it,
   * through the opposite mutation.
   */
  onChange: (change: RelationChange) => void;
}

/** A row in one of the relation lists, tagged with the side that declared it. */
interface RelationRow {
  id: string;
  title: string;
  origin: RelationOrigin;
  /** null when the id names a bean no longer in the project (dangling link). */
  bean: LinkedBean | null;
}

function toRow(bean: LinkedBean, origin: RelationOrigin): RelationRow {
  return { id: bean.id, title: bean.title, origin, bean };
}

/**
 * Both halves of one relation as a single list. An edge declared on both sides
 * appears once, as `own`, so its Remove uses the mutation that acts on this bean.
 */
function union(own: RelationRow[], inbound: LinkedBean[]): RelationRow[] {
  const seen = new Set(own.map((row) => row.id));
  return [...own, ...inbound.filter((b) => !seen.has(b.id)).map((b) => toRow(b, "inbound"))];
}

/** Resolves ids held only as strings against the project's bean list. */
function ownRowsFromIds(candidates: BeanListItem[], ids: string[]): RelationRow[] {
  return ids.map((id) => {
    const match = candidates.find((candidate) => candidate.id === id);
    return match
      ? toRow({ id, title: match.title, type: match.type, status: match.status }, "own")
      : { id, title: id, origin: "own" as const, bean: null };
  });
}

function RelationRowItem({
  project,
  row,
  removeLabel,
  onRemove,
}: {
  project: string;
  row: RelationRow;
  removeLabel?: string;
  onRemove?: () => void;
}) {
  return (
    <li className="relation-editor-item">
      {row.bean ? (
        <Link
          to="/p/$project/$beanId"
          params={{ project, beanId: row.id }}
          className="relation-editor-link"
        >
          <BeanTypeTag type={row.bean.type} />
          <span className="relation-editor-title">{row.title}</span>
        </Link>
      ) : (
        <span className="relation-editor-title">{row.title}</span>
      )}
      {onRemove && removeLabel && (
        <button
          type="button"
          className="relation-editor-remove"
          aria-label={removeLabel}
          onClick={onRemove}
        >
          Remove
        </button>
      )}
    </li>
  );
}

type Picker = null | "parent" | "blocking" | "blockedBy";

export function RelationEditor({ project, bean, candidates, onChange }: RelationEditorProps) {
  const [picker, setPicker] = useState<Picker>(null);
  const parentTypes = validParentTypes(bean.type);

  const parentOptions = candidates.filter(
    (candidate) => candidate.id !== bean.id && canParent(bean.type, candidate.type),
  );

  // Each direction is this bean's own id list matched against the project, plus
  // the half the server resolved from the beans that declared the edge instead.
  const blocksRows = union(ownRowsFromIds(candidates, bean.blockingIds), bean.blocksInbound);
  const blockedByRows = union(ownRowsFromIds(candidates, bean.blockedByIds), bean.blockedBy);

  const blockedIds = new Set(blocksRows.map((row) => row.id));
  const blockerIds = new Set(blockedByRows.map((row) => row.id));
  const blockingOptions = candidates.filter(
    (candidate) => candidate.id !== bean.id && !blockedIds.has(candidate.id),
  );
  const blockedByOptions = candidates.filter(
    (candidate) => candidate.id !== bean.id && !blockerIds.has(candidate.id),
  );

  return (
    <div className="relation-editor" data-testid="relations">
      {parentTypes !== null && (
        <div className="relation-editor-section">
          <h3 className="relation-editor-label">Parent</h3>
          <ul className="relation-editor-list">
            {bean.parent ? (
              <RelationRowItem project={project} row={toRow(bean.parent, "own")} />
            ) : (
              <li className="relation-editor-item">
                <span className="muted">(none)</span>
              </li>
            )}
          </ul>
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
          {blocksRows.map((row) => (
            <RelationRowItem
              key={row.id}
              project={project}
              row={row}
              removeLabel={`Remove ${row.title} from blocks`}
              onRemove={() =>
                onChange({ kind: "removeBlocking", targetId: row.id, origin: row.origin })
              }
            />
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
          {blockedByRows.map((row) => (
            <RelationRowItem
              key={row.id}
              project={project}
              row={row}
              removeLabel={`Remove ${row.title} from blocked by`}
              onRemove={() =>
                onChange({ kind: "removeBlockedBy", targetId: row.id, origin: row.origin })
              }
            />
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

      {bean.children.length > 0 && (
        <div className="relation-editor-section">
          <h3 className="relation-editor-label">Children</h3>
          <ul className="relation-editor-list">
            {bean.children.map((child) => (
              <RelationRowItem key={child.id} project={project} row={toRow(child, "own")} />
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
