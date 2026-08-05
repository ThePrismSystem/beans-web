import { canParent, validParentTypes } from "@beans-frontend/shared";
import { Link } from "@tanstack/react-router";
import { useState } from "react";

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

/**
 * One direction of the blocking relation: a list, a Remove per row, and a
 * multi-select picker to add more. The two directions differ only in their
 * copy and in which `RelationChange` they emit, so both are passed in — the
 * section itself never names a `kind`, which is what keeps the two from
 * getting crossed.
 */
function RelationListSection({
  project,
  label,
  rows,
  addLabel,
  pickerTitle,
  pickerOpen,
  options,
  removeLabel,
  onOpenPicker,
  onClosePicker,
  onAdd,
  onRemove,
}: {
  project: string;
  label: string;
  rows: RelationRow[];
  addLabel: string;
  pickerTitle: string;
  pickerOpen: boolean;
  options: BeanListItem[];
  removeLabel: (row: RelationRow) => string;
  onOpenPicker: () => void;
  onClosePicker: () => void;
  onAdd: (targetId: string) => void;
  onRemove: (row: RelationRow) => void;
}) {
  return (
    <div className="relation-editor-section">
      <h3 className="relation-editor-label">{label}</h3>
      <ul className="relation-editor-list">
        {rows.map((row) => (
          <RelationRowItem
            key={row.id}
            project={project}
            row={row}
            removeLabel={removeLabel(row)}
            onRemove={() => {
              onRemove(row);
            }}
          />
        ))}
      </ul>
      <button type="button" onClick={onOpenPicker}>
        {addLabel}
      </button>
      <BeanPicker
        open={pickerOpen}
        title={pickerTitle}
        candidates={options}
        mode="multi"
        onClose={onClosePicker}
        onPick={(ids) => {
          onClosePicker();
          ids.forEach((targetId) => {
            onAdd(targetId);
          });
        }}
      />
    </div>
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
          <button
            type="button"
            onClick={() => {
              setPicker("parent");
            }}
          >
            Set parent
          </button>
          <BeanPicker
            open={picker === "parent"}
            title="Set parent"
            candidates={parentOptions}
            mode="single"
            allowNone
            onClose={() => {
              setPicker(null);
            }}
            onPick={(ids) => {
              setPicker(null);
              onChange({ kind: "setParent", parentId: ids[0] ?? null });
            }}
          />
        </div>
      )}

      <RelationListSection
        project={project}
        label="Blocks"
        rows={blocksRows}
        addLabel="Add blocks"
        pickerTitle="Add blocks"
        pickerOpen={picker === "blocking"}
        options={blockingOptions}
        removeLabel={(row) => `Remove ${row.title} from blocks`}
        onOpenPicker={() => {
          setPicker("blocking");
        }}
        onClosePicker={() => {
          setPicker(null);
        }}
        onAdd={(targetId) => {
          onChange({ kind: "addBlocking", targetId });
        }}
        onRemove={(row) => {
          onChange({ kind: "removeBlocking", targetId: row.id, origin: row.origin });
        }}
      />

      <RelationListSection
        project={project}
        label="Blocked by"
        rows={blockedByRows}
        addLabel="Add blocked by"
        pickerTitle="Add blocked by"
        pickerOpen={picker === "blockedBy"}
        options={blockedByOptions}
        removeLabel={(row) => `Remove ${row.title} from blocked by`}
        onOpenPicker={() => {
          setPicker("blockedBy");
        }}
        onClosePicker={() => {
          setPicker(null);
        }}
        onAdd={(targetId) => {
          onChange({ kind: "addBlockedBy", targetId });
        }}
        onRemove={(row) => {
          onChange({ kind: "removeBlockedBy", targetId: row.id, origin: row.origin });
        }}
      />

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
