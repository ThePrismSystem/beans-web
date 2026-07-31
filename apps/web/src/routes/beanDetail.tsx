import { useNavigate, useParams } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { BEAN_PRIORITIES, BEAN_STATUSES, BEAN_TYPES } from "@beans-frontend/shared";

import { BeanTypeTag } from "../components/BeanTypeTag.js";
import { ConfirmDialog } from "../components/ConfirmDialog.js";
import { CreateBeanForm } from "../components/CreateBeanForm.js";
import { InlineEditRow } from "../components/InlineEditRow.js";
import { LinkedBeans } from "../components/LinkedBeans.js";
import { RelationEditor } from "../components/RelationEditor.js";
import { StatusDot } from "../components/StatusDot.js";

import { useBean } from "../hooks/useBean.js";
import { useBeans } from "../hooks/useBeans.js";
import {
  describeMutationError,
  isEtagConflict,
  useAddBlockedBy,
  useAddBlocking,
  useCreateBean,
  useDeleteBean,
  useRemoveBlockedBy,
  useRemoveBlocking,
  useSetParent,
  useUpdateBean,
} from "../hooks/useMutations.js";
import { EMPTY_BEAN_FILTER } from "../lib/filter.js";
import { renderMarkdown } from "../lib/markdown.js";

import type { BeanDetail, BeanListItem } from "@beans-frontend/shared";
import type { RelationChange } from "../components/RelationEditor.js";

const BODY_TEXTAREA_ROWS = 14;

function formatTimestamp(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
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

  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");
  const [bodyDraft, setBodyDraft] = useState(bean.body);
  const [editingBody, setEditingBody] = useState(false);
  const [syncedBodyForId, setSyncedBodyForId] = useState(bean.id);
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
  const [isCreating, setIsCreating] = useState(false);

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
    const next = BEAN_STATUSES.find((option) => option === value);
    if (next && next !== bean.status) {
      updateBean.mutate({ id: bean.id, etag: bean.etag, input: { status: next } });
    }
  }

  function saveType(value: string) {
    const next = BEAN_TYPES.find((option) => option === value);
    if (next && next !== bean.type) {
      updateBean.mutate({ id: bean.id, etag: bean.etag, input: { type: next } });
    }
  }

  function savePriority(value: string) {
    const next = BEAN_PRIORITIES.find((option) => option === value);
    if (next && next !== bean.priority) {
      updateBean.mutate({ id: bean.id, etag: bean.etag, input: { priority: next } });
    }
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
      case "removeBlocking":
        removeBlocking.mutate({ id: bean.id, targetId: change.targetId });
        break;
      case "addBlockedBy":
        addBlockedBy.mutate({ id: bean.id, targetId: change.targetId });
        break;
      case "removeBlockedBy":
        removeBlockedBy.mutate({ id: bean.id, targetId: change.targetId });
        break;
    }
  }

  function handleScrap() {
    const reason = window.prompt("Reason for scrapping this bean?");
    if (reason === null) {
      return;
    }
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
      <header className="bean-detail-header">
        {isEditingTitle ? (
          <input
            aria-label="Title"
            className="bean-detail-title-input"
            value={titleDraft}
            autoFocus
            onChange={(event) => setTitleDraft(event.target.value)}
            onBlur={commitTitle}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                commitTitle();
              } else if (event.key === "Escape") {
                setIsEditingTitle(false);
              }
            }}
          />
        ) : (
          <button
            type="button"
            className="bean-detail-title"
            onClick={startEditingTitle}
            aria-label={`Edit title: ${bean.title}`}
          >
            {bean.title}
          </button>
        )}

        <div className="bean-detail-inline-rows">
          <InlineEditRow
            label="Type"
            display={<BeanTypeTag type={bean.type} />}
            initialValue={bean.type}
            onSave={saveType}
            editor={({ value, onValue }) => (
              <select
                aria-label="Type editor"
                value={value}
                onChange={(event) => onValue(event.target.value)}
              >
                {BEAN_TYPES.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            )}
          />
          <InlineEditRow
            label="Status"
            display={<StatusDot status={bean.status} />}
            initialValue={bean.status}
            onSave={saveStatus}
            editor={({ value, onValue }) => (
              <select
                aria-label="Status editor"
                value={value}
                onChange={(event) => onValue(event.target.value)}
              >
                {BEAN_STATUSES.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            )}
          />
          <InlineEditRow
            label="Priority"
            display={bean.priority}
            initialValue={bean.priority}
            onSave={savePriority}
            editor={({ value, onValue }) => (
              <select
                aria-label="Priority editor"
                value={value}
                onChange={(event) => onValue(event.target.value)}
              >
                {BEAN_PRIORITIES.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            )}
          />
          <InlineEditRow
            label="Tags"
            display={bean.tags.join(", ") || "—"}
            initialValue={bean.tags.join(", ")}
            onSave={saveTags}
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

      <section className="bean-detail-section">
        {editingBody ? (
          <>
            <textarea
              aria-label="Body"
              className="body-editor-textarea"
              value={bodyDraft}
              onChange={(event) => setBodyDraft(event.target.value)}
              rows={BODY_TEXTAREA_ROWS}
            />
            <div className="bean-detail-body-actions">
              <button
                type="button"
                onClick={() => {
                  setEditingBody(false);
                  if (bodyDraft !== bean.body) {
                    saveBody();
                  }
                }}
              >
                Save body
              </button>
              <button
                type="button"
                onClick={() => {
                  setBodyDraft(bean.body);
                  setEditingBody(false);
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
              dangerouslySetInnerHTML={{ __html: renderMarkdown(bean.body) }}
            />
            <div className="bean-detail-body-actions">
              <button
                type="button"
                onClick={() => {
                  setBodyDraft(bean.body);
                  setEditingBody(true);
                }}
              >
                Edit body
              </button>
            </div>
          </>
        )}
      </section>

      <section className="bean-detail-section">
        <h2 className="bean-detail-section-title">Relationships</h2>
        <RelationEditor bean={bean} candidates={candidates} onChange={handleRelationChange} />
      </section>

      <LinkedBeans
        project={project}
        parent={bean.parent}
        children={bean.children}
        blocking={bean.blocking}
        blockedBy={bean.blockedBy}
      />

      <section className="bean-detail-actions">
        <button type="button" onClick={() => setIsCreating((v) => !v)}>
          + New bean
        </button>
        <button type="button" onClick={handleScrap}>
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

      <ConfirmDialog
        open={isConfirmingDelete}
        title="Delete this bean?"
        message={`"${bean.title}" will be permanently deleted.`}
        confirmLabel="Delete"
        onConfirm={handleDeleteConfirmed}
        onCancel={() => setIsConfirmingDelete(false)}
      />
    </article>
  );
}

export function BeanDetailPage() {
  const { project, beanId } = useParams({ from: "/p/$project/$beanId" });
  const navigate = useNavigate({ from: "/p/$project/$beanId" });
  const { data: bean, isPending, isError, refetch } = useBean(project, beanId);
  const { data: allBeans } = useBeans(project, EMPTY_BEAN_FILTER);

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
