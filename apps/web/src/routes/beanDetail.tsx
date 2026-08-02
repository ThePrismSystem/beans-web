import { useNavigate, useParams } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";

import { BEAN_PRIORITIES, BEAN_STATUSES, BEAN_TYPES } from "@beans-frontend/shared";

import { BeanTypeTag } from "../components/BeanTypeTag.js";
import { ConfirmDialog } from "../components/ConfirmDialog.js";
import { CreateBeanForm } from "../components/CreateBeanForm.js";
import { EnumSelect } from "../components/EnumSelect.js";
import { InlineEditRow } from "../components/InlineEditRow.js";
import { RelationEditor } from "../components/RelationEditor.js";
import { StatusDot } from "../components/StatusDot.js";

import { useBean } from "../hooks/useBean.js";
import { useProjectBeans } from "../hooks/useBeans.js";
import {
  describeMutationError,
  isEtagConflict,
  useAddBlockedBy,
  useAddBlocking,
  useCreateBean,
  useDeleteBean,
  useRemoveBlockedBy,
  useRemoveBlocking,
  useReopenAncestors,
  useSetParent,
  useUpdateBean,
} from "../hooks/useMutations.js";
import { parseEnumValue } from "../lib/enum.js";
import { renderMarkdown } from "../lib/markdown.js";
import { closedAncestors, indexById, isOrphaned } from "../lib/orphan.js";

import type { BeanDetail, BeanListItem } from "@beans-frontend/shared";
import type { RelationChange } from "../components/RelationEditor.js";

function formatTimestamp(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function saveField<T extends string>(
  options: readonly T[],
  current: T,
  value: string,
  apply: (next: T) => void,
): void {
  const next = parseEnumValue(value, options);
  if (next && next !== current) {
    apply(next);
  }
}

interface BeanDetailHeaderProps {
  bean: BeanDetail;
  isEditingTitle: boolean;
  titleDraft: string;
  onTitleDraftChange: (value: string) => void;
  onStartEditingTitle: () => void;
  onCommitTitle: () => void;
  onCancelEditingTitle: () => void;
  onSaveType: (value: string) => void;
  onSaveStatus: (value: string) => void;
  onSavePriority: (value: string) => void;
  onSaveTags: (value: string) => void;
}

function BeanDetailHeader({
  bean,
  isEditingTitle,
  titleDraft,
  onTitleDraftChange,
  onStartEditingTitle,
  onCommitTitle,
  onCancelEditingTitle,
  onSaveType,
  onSaveStatus,
  onSavePriority,
  onSaveTags,
}: BeanDetailHeaderProps) {
  return (
    <header className="bean-detail-header">
      {/* The bean's title is the page's top-level heading, so it stays an <h1>
          in both states — otherwise the document starts at <h2> and the
          heading outline has no root. */}
      <h1 className="bean-detail-title-heading">
        {isEditingTitle ? (
          <input
            aria-label="Title"
            className="bean-detail-title-input"
            value={titleDraft}
            autoFocus
            onChange={(event) => onTitleDraftChange(event.target.value)}
            onBlur={onCommitTitle}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                onCommitTitle();
              } else if (event.key === "Escape") {
                onCancelEditingTitle();
              }
            }}
          />
        ) : (
          // No aria-label: the <h1> takes its accessible name from this
          // button's, so an "Edit title: …" label made heading-list navigation
          // announce the action instead of the bean. The button role already
          // conveys that it does something; `title` carries the hint visually.
          <button
            type="button"
            className="bean-detail-title"
            onClick={onStartEditingTitle}
            title="Edit title"
          >
            {bean.title}
          </button>
        )}
      </h1>

      <div className="bean-detail-inline-rows">
        <InlineEditRow
          label="Type"
          display={<BeanTypeTag type={bean.type} />}
          initialValue={bean.type}
          onSave={onSaveType}
          editor={({ value, onValue }) => (
            <EnumSelect
              ariaLabel="Type editor"
              options={BEAN_TYPES}
              value={value}
              onChange={onValue}
            />
          )}
        />
        <InlineEditRow
          label="Status"
          display={<StatusDot status={bean.status} />}
          initialValue={bean.status}
          onSave={onSaveStatus}
          editor={({ value, onValue }) => (
            <EnumSelect
              ariaLabel="Status editor"
              options={BEAN_STATUSES}
              value={value}
              onChange={onValue}
            />
          )}
        />
        <InlineEditRow
          label="Priority"
          display={bean.priority}
          initialValue={bean.priority}
          onSave={onSavePriority}
          editor={({ value, onValue }) => (
            <EnumSelect
              ariaLabel="Priority editor"
              options={BEAN_PRIORITIES}
              value={value}
              onChange={onValue}
            />
          )}
        />
        <InlineEditRow
          label="Tags"
          display={bean.tags.join(", ") || "—"}
          initialValue={bean.tags.join(", ")}
          onSave={onSaveTags}
          editor={({ value, onValue }) => (
            <input
              aria-label="Tags editor"
              value={value}
              onChange={(event) => onValue(event.target.value)}
            />
          )}
        />
      </div>

      <div className="bean-detail-meta">
        <span className="bean-id">{bean.id}</span>
        <span className="bean-detail-timestamp">Created {formatTimestamp(bean.createdAt)}</span>
        <span className="bean-detail-timestamp">Updated {formatTimestamp(bean.updatedAt)}</span>
      </div>
    </header>
  );
}

const BODY_TEXTAREA_ROWS = 14;

interface BeanDetailBodyProps {
  body: string;
  editingBody: boolean;
  bodyDraft: string;
  onBodyDraftChange: (value: string) => void;
  onEditingBodyChange: (value: boolean) => void;
  onSaveBody: () => void;
}

function BeanDetailBody({
  body,
  editingBody,
  bodyDraft,
  onBodyDraftChange,
  onEditingBodyChange,
  onSaveBody,
}: BeanDetailBodyProps) {
  return (
    <section className="bean-detail-section">
      {editingBody ? (
        <>
          <textarea
            aria-label="Body"
            className="body-editor-textarea"
            value={bodyDraft}
            onChange={(event) => onBodyDraftChange(event.target.value)}
            rows={BODY_TEXTAREA_ROWS}
          />
          <div className="bean-detail-body-actions">
            <button
              type="button"
              onClick={() => {
                onEditingBodyChange(false);
                if (bodyDraft !== body) {
                  onSaveBody();
                }
              }}
            >
              Save body
            </button>
            <button
              type="button"
              onClick={() => {
                onBodyDraftChange(body);
                onEditingBodyChange(false);
              }}
            >
              Cancel
            </button>
          </div>
        </>
      ) : (
        <>
          <div
            className="bean-detail-body"
            // Body is markdown -> HTML rendered through renderMarkdown(), which
            // pipes the output through DOMPurify before it ever reaches the DOM.
            dangerouslySetInnerHTML={{ __html: renderMarkdown(body) }}
          />
          <div className="bean-detail-body-actions">
            <button
              type="button"
              onClick={() => {
                onBodyDraftChange(body);
                onEditingBodyChange(true);
              }}
            >
              Edit body
            </button>
          </div>
        </>
      )}
    </section>
  );
}

interface BeanDetailDialogsProps {
  bean: BeanDetail;
  isConfirmingDelete: boolean;
  onConfirmingDeleteChange: (value: boolean) => void;
  onDeleteConfirmed: () => void;
  ancestorsToReopen: BeanListItem[];
  isConfirmingReopen: boolean;
  onConfirmingReopenChange: (value: boolean) => void;
  onReopenConfirmed: () => void;
  isConfirmingScrap: boolean;
  onConfirmingScrapChange: (value: boolean) => void;
  onScrapConfirmed: (reason: string) => void;
}

function BeanDetailDialogs({
  bean,
  isConfirmingDelete,
  onConfirmingDeleteChange,
  onDeleteConfirmed,
  ancestorsToReopen,
  isConfirmingReopen,
  onConfirmingReopenChange,
  onReopenConfirmed,
  isConfirmingScrap,
  onConfirmingScrapChange,
  onScrapConfirmed,
}: BeanDetailDialogsProps) {
  return (
    <>
      <ConfirmDialog
        open={isConfirmingDelete}
        title="Delete this bean?"
        message={`"${bean.title}" will be permanently deleted.`}
        confirmLabel="Delete"
        onConfirm={onDeleteConfirmed}
        onCancel={() => onConfirmingDeleteChange(false)}
      />

      {/* Replaces window.prompt(), which the browser draws itself: it ignores
          the theme, cannot be styled, and blocks the main thread until it is
          dismissed. */}
      <ConfirmDialog
        open={isConfirmingScrap}
        title="Scrap this bean?"
        message={`"${bean.title}" will be marked scrapped.`}
        reasonLabel="Reason"
        reasonPlaceholder="Why is this being scrapped?"
        confirmLabel="Scrap"
        onConfirm={onScrapConfirmed}
        onCancel={() => onConfirmingScrapChange(false)}
      />

      <ConfirmDialog
        open={isConfirmingReopen}
        title={
          ancestorsToReopen.length > 1
            ? `Re-open ${ancestorsToReopen.length} ancestors?`
            : "Re-open parent?"
        }
        message={
          <ul className="confirm-dialog-list">
            {ancestorsToReopen.map((ancestor) => (
              <li key={ancestor.id}>
                <span className="bean-id">{ancestor.id}</span> “{ancestor.title}” —{" "}
                {ancestor.status} → {bean.status}
              </li>
            ))}
          </ul>
        }
        confirmLabel="Re-open"
        onConfirm={onReopenConfirmed}
        onCancel={() => onConfirmingReopenChange(false)}
      />
    </>
  );
}

interface BeanDetailContentProps {
  project: string;
  bean: BeanDetail;
  candidates: BeanListItem[];
  navigate: ReturnType<typeof useNavigate>;
  refetch: () => void;
}

function BeanDetailContent({
  project,
  bean,
  candidates,
  navigate,
  refetch,
}: BeanDetailContentProps) {
  const updateBean = useUpdateBean(project);
  const setParent = useSetParent(project);
  const addBlocking = useAddBlocking(project);
  const removeBlocking = useRemoveBlocking(project);
  const addBlockedBy = useAddBlockedBy(project);
  const removeBlockedBy = useRemoveBlockedBy(project);
  const deleteBean = useDeleteBean(project);
  const createBean = useCreateBean(project);
  const reopenAncestors = useReopenAncestors(project);

  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");
  const [bodyDraft, setBodyDraft] = useState(bean.body);
  const [editingBody, setEditingBody] = useState(false);
  const [syncedBodyForId, setSyncedBodyForId] = useState(bean.id);
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [isConfirmingReopen, setIsConfirmingReopen] = useState(false);
  const [isConfirmingScrap, setIsConfirmingScrap] = useState(false);

  // `candidates` is the full project dataset minus this bean, so it resolves
  // the parent chain — and orphan status is computed against all of it, never
  // a filtered subset.
  const byId = useMemo(() => indexById(candidates), [candidates]);
  const ancestorsToReopen = useMemo(
    () => (isOrphaned(bean, byId) ? closedAncestors(bean, byId) : []),
    [bean, byId],
  );

  useEffect(() => {
    if (bean.id !== syncedBodyForId) {
      setBodyDraft(bean.body);
      setSyncedBodyForId(bean.id);
    }
  }, [bean.id, bean.body, syncedBodyForId]);

  // Surface only the most recently fired mutation's error, so a later success
  // clears a banner from an earlier failure instead of leaving it stuck.
  const mutations = [
    updateBean,
    setParent,
    addBlocking,
    removeBlocking,
    addBlockedBy,
    removeBlockedBy,
    deleteBean,
    createBean,
    reopenAncestors,
  ];
  const latestMutation = mutations.reduce((latest, m) =>
    m.submittedAt > latest.submittedAt ? m : latest,
  );
  const mutationError = latestMutation.isError ? latestMutation.error : null;

  function startEditingTitle() {
    setTitleDraft(bean.title);
    setIsEditingTitle(true);
  }

  function commitTitle() {
    setIsEditingTitle(false);
    const trimmed = titleDraft.trim();
    if (trimmed && trimmed !== bean.title) {
      updateBean.mutate({ id: bean.id, etag: bean.etag, input: { title: trimmed } });
    }
  }

  function saveStatus(value: string) {
    saveField(BEAN_STATUSES, bean.status, value, (status) =>
      updateBean.mutate({ id: bean.id, etag: bean.etag, input: { status } }),
    );
  }

  function saveType(value: string) {
    saveField(BEAN_TYPES, bean.type, value, (type) =>
      updateBean.mutate({ id: bean.id, etag: bean.etag, input: { type } }),
    );
  }

  function savePriority(value: string) {
    saveField(BEAN_PRIORITIES, bean.priority, value, (priority) =>
      updateBean.mutate({ id: bean.id, etag: bean.etag, input: { priority } }),
    );
  }

  function saveTags(value: string) {
    const tagList = value
      .split(",")
      .map((tag) => tag.trim())
      .filter((tag) => tag.length > 0);
    const unchanged =
      tagList.length === bean.tags.length && tagList.every((tag, i) => tag === bean.tags[i]);
    if (!unchanged) {
      updateBean.mutate({ id: bean.id, etag: bean.etag, input: { tags: tagList } });
    }
  }

  function saveBody() {
    if (bodyDraft !== bean.body) {
      updateBean.mutate({ id: bean.id, etag: bean.etag, input: { body: bodyDraft } });
    }
  }

  function handleRelationChange(change: RelationChange) {
    switch (change.kind) {
      case "setParent":
        setParent.mutate({ id: bean.id, parentId: change.parentId });
        break;
      case "addBlocking":
        addBlocking.mutate({ id: bean.id, targetId: change.targetId });
        break;
      // An `inbound` edge lives in the other bean's file. Calling the matching
      // mutation on this bean would report success and change nothing, so the
      // inverse mutation is issued against the bean that declared it.
      case "removeBlocking":
        if (change.origin === "own") {
          removeBlocking.mutate({ id: bean.id, targetId: change.targetId });
        } else {
          removeBlockedBy.mutate({ id: change.targetId, targetId: bean.id });
        }
        break;
      case "addBlockedBy":
        addBlockedBy.mutate({ id: bean.id, targetId: change.targetId });
        break;
      case "removeBlockedBy":
        if (change.origin === "own") {
          removeBlockedBy.mutate({ id: bean.id, targetId: change.targetId });
        } else {
          removeBlocking.mutate({ id: change.targetId, targetId: bean.id });
        }
        break;
    }
  }

  function handleScrapConfirmed(reason: string) {
    setIsConfirmingScrap(false);
    updateBean.mutate({
      id: bean.id,
      etag: bean.etag,
      input: {
        status: "scrapped",
        bodyMod: { append: `## Reasons for Scrapping\n\n${reason}`, replace: null },
      },
    });
  }

  function handleDeleteConfirmed() {
    setIsConfirmingDelete(false);
    deleteBean.mutate(
      { id: bean.id },
      {
        onSuccess: () => {
          void navigate({ to: "/p/$project", params: { project } });
        },
      },
    );
  }

  function handleReopenConfirmed() {
    setIsConfirmingReopen(false);
    reopenAncestors.mutate({
      ancestorIds: ancestorsToReopen.map((ancestor) => ancestor.id),
      status: bean.status,
    });
  }

  function handleCreateSubmit(input: Parameters<typeof createBean.mutate>[0]) {
    createBean.mutate(input, {
      onSuccess: (created) => {
        setIsCreating(false);
        void navigate({ to: "/p/$project/$beanId", params: { project, beanId: created.id } });
      },
    });
  }

  return (
    <article className="bean-detail">
      <BeanDetailHeader
        bean={bean}
        isEditingTitle={isEditingTitle}
        titleDraft={titleDraft}
        onTitleDraftChange={setTitleDraft}
        onStartEditingTitle={startEditingTitle}
        onCommitTitle={commitTitle}
        onCancelEditingTitle={() => setIsEditingTitle(false)}
        onSaveType={saveType}
        onSaveStatus={saveStatus}
        onSavePriority={savePriority}
        onSaveTags={saveTags}
      />

      {mutationError && (
        <div className="mutation-error" role="alert">
          <p>{describeMutationError(mutationError)}</p>
          {isEtagConflict(mutationError) && (
            <button type="button" onClick={() => refetch()}>
              Reload
            </button>
          )}
        </div>
      )}

      {ancestorsToReopen.length > 0 && (
        <div className="bean-detail-orphan" role="status">
          <p>
            Orphaned — parent <span className="bean-id">{ancestorsToReopen[0]!.id}</span> “
            {ancestorsToReopen[0]!.title}” is {ancestorsToReopen[0]!.status}.
          </p>
          <button type="button" onClick={() => setIsConfirmingReopen(true)}>
            {ancestorsToReopen.length > 1
              ? `Re-open ${ancestorsToReopen.length} ancestors`
              : "Re-open parent"}
          </button>
        </div>
      )}

      <BeanDetailBody
        body={bean.body}
        editingBody={editingBody}
        bodyDraft={bodyDraft}
        onBodyDraftChange={setBodyDraft}
        onEditingBodyChange={setEditingBody}
        onSaveBody={saveBody}
      />

      <section className="bean-detail-section">
        <h2 className="bean-detail-section-title">Relationships</h2>
        <RelationEditor
          project={project}
          bean={bean}
          candidates={candidates}
          onChange={handleRelationChange}
        />
      </section>

      <section className="bean-detail-actions">
        <button type="button" onClick={() => setIsCreating((v) => !v)}>
          + New bean
        </button>
        <button type="button" onClick={() => setIsConfirmingScrap(true)}>
          Scrap
        </button>
        <button
          type="button"
          className="bean-detail-delete"
          onClick={() => setIsConfirmingDelete(true)}
        >
          Delete
        </button>
      </section>

      {isCreating && (
        <section className="bean-detail-section">
          <h2 className="bean-detail-section-title">New bean</h2>
          <CreateBeanForm
            // Include the current bean so a pre-filled parent can render and be
            // hierarchy-validated; RelationEditor still uses `candidates` (which
            // excludes the current bean, since a bean cannot parent itself).
            candidates={[bean, ...candidates]}
            defaultParentId={bean.id}
            onSubmit={handleCreateSubmit}
            onCancel={() => setIsCreating(false)}
          />
        </section>
      )}

      <BeanDetailDialogs
        bean={bean}
        isConfirmingDelete={isConfirmingDelete}
        onConfirmingDeleteChange={setIsConfirmingDelete}
        onDeleteConfirmed={handleDeleteConfirmed}
        ancestorsToReopen={ancestorsToReopen}
        isConfirmingReopen={isConfirmingReopen}
        onConfirmingReopenChange={setIsConfirmingReopen}
        onReopenConfirmed={handleReopenConfirmed}
        isConfirmingScrap={isConfirmingScrap}
        onConfirmingScrapChange={setIsConfirmingScrap}
        onScrapConfirmed={handleScrapConfirmed}
      />
    </article>
  );
}

export function BeanDetailPage() {
  const { project, beanId } = useParams({ from: "/p/$project/$beanId" });
  const navigate = useNavigate({ from: "/p/$project/$beanId" });
  const { data: bean, isPending, isError, refetch } = useBean(project, beanId);
  const { data: allBeans } = useProjectBeans(project, "");

  if (isPending) {
    return <p className="muted">Loading bean…</p>;
  }

  if (isError) {
    return <p className="muted">Failed to load bean.</p>;
  }

  const candidates = (allBeans ?? []).filter((candidate) => candidate.id !== bean.id);

  return (
    <BeanDetailContent
      project={project}
      bean={bean}
      candidates={candidates}
      navigate={navigate}
      refetch={() => void refetch()}
    />
  );
}
