import { useNavigate, useParams } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { BEAN_PRIORITIES, BEAN_STATUSES, BEAN_TYPES } from "@beans-frontend/shared";

import { BeanTypeTag } from "../components/BeanTypeTag.js";
import { BodyEditor } from "../components/BodyEditor.js";
import { ConfirmDialog } from "../components/ConfirmDialog.js";
import { CreateBeanForm } from "../components/CreateBeanForm.js";
import { LinkedBeans } from "../components/LinkedBeans.js";
import { RelationEditor } from "../components/RelationEditor.js";
import { StatusDot } from "../components/StatusDot.js";

import { useBean } from "../hooks/useBean.js";
import { EMPTY_BEAN_FILTER, useBeans } from "../hooks/useBeans.js";
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
import { renderMarkdown } from "../lib/markdown.js";

import type { ChangeEvent } from "react";
import type { Bean } from "@beans-frontend/shared";
import type { RelationChange } from "../components/RelationEditor.js";
import type { BeanDetail } from "../hooks/useBean.js";

function formatTimestamp(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

interface BeanDetailContentProps {
  project: string;
  bean: BeanDetail;
  candidates: Bean[];
  navigate: ReturnType<typeof useNavigate>;
  refetch: () => void;
  updateBean: ReturnType<typeof useUpdateBean>;
  setParent: ReturnType<typeof useSetParent>;
  addBlocking: ReturnType<typeof useAddBlocking>;
  removeBlocking: ReturnType<typeof useRemoveBlocking>;
  addBlockedBy: ReturnType<typeof useAddBlockedBy>;
  removeBlockedBy: ReturnType<typeof useRemoveBlockedBy>;
  deleteBean: ReturnType<typeof useDeleteBean>;
  createBean: ReturnType<typeof useCreateBean>;
}

function BeanDetailContent({
  project,
  bean,
  candidates,
  navigate,
  refetch,
  updateBean,
  setParent,
  addBlocking,
  removeBlocking,
  addBlockedBy,
  removeBlockedBy,
  deleteBean,
  createBean,
}: BeanDetailContentProps) {
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");
  const [bodyDraft, setBodyDraft] = useState(bean.body);
  const [syncedBodyForId, setSyncedBodyForId] = useState(bean.id);
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
  const [isCreating, setIsCreating] = useState(false);

  useEffect(() => {
    if (bean.id !== syncedBodyForId) {
      setBodyDraft(bean.body);
      setSyncedBodyForId(bean.id);
    }
  }, [bean.id, bean.body, syncedBodyForId]);

  const mutationError =
    updateBean.error ??
    setParent.error ??
    addBlocking.error ??
    removeBlocking.error ??
    addBlockedBy.error ??
    removeBlockedBy.error ??
    deleteBean.error ??
    createBean.error ??
    null;

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

  function handleStatusChange(event: ChangeEvent<HTMLSelectElement>) {
    const next = BEAN_STATUSES.find((option) => option === event.target.value);
    if (next && next !== bean.status) {
      updateBean.mutate({ id: bean.id, etag: bean.etag, input: { status: next } });
    }
  }

  function handleTypeChange(event: ChangeEvent<HTMLSelectElement>) {
    const next = BEAN_TYPES.find((option) => option === event.target.value);
    if (next && next !== bean.type) {
      updateBean.mutate({ id: bean.id, etag: bean.etag, input: { type: next } });
    }
  }

  function handlePriorityChange(event: ChangeEvent<HTMLSelectElement>) {
    const next = BEAN_PRIORITIES.find((option) => option === event.target.value);
    if (next && next !== bean.priority) {
      updateBean.mutate({ id: bean.id, etag: bean.etag, input: { priority: next } });
    }
  }

  function commitTags(event: ChangeEvent<HTMLInputElement>) {
    const tagList = event.target.value
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
        setParent.mutate({ id: bean.id, parentId: change.parentId, etag: bean.etag });
        break;
      case "addBlocking":
        addBlocking.mutate({ id: bean.id, targetId: change.targetId, etag: bean.etag });
        break;
      case "removeBlocking":
        removeBlocking.mutate({ id: bean.id, targetId: change.targetId, etag: bean.etag });
        break;
      case "addBlockedBy":
        addBlockedBy.mutate({ id: bean.id, targetId: change.targetId, etag: bean.etag });
        break;
      case "removeBlockedBy":
        removeBlockedBy.mutate({ id: bean.id, targetId: change.targetId, etag: bean.etag });
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
        <div className="bean-detail-title-row">
          <select
            aria-label="Type"
            className="bean-detail-type-select"
            value={bean.type}
            onChange={handleTypeChange}
          >
            {BEAN_TYPES.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
          <BeanTypeTag type={bean.type} />
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
            <h1 className="bean-detail-title" onClick={startEditingTitle}>
              {bean.title}
            </h1>
          )}
          <select aria-label="Status" value={bean.status} onChange={handleStatusChange}>
            {BEAN_STATUSES.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
          <StatusDot status={bean.status} />
        </div>
        <div className="bean-detail-meta">
          <span className="bean-id">{bean.id}</span>
          <label className="bean-detail-priority-label">
            Priority
            <select value={bean.priority} onChange={handlePriorityChange}>
              {BEAN_PRIORITIES.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
          <label className="bean-detail-tags-label">
            Tags
            <input
              key={bean.tags.join(",")}
              defaultValue={bean.tags.join(", ")}
              onBlur={commitTags}
            />
          </label>
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

      <div
        className="bean-detail-body"
        // Body is markdown -> HTML rendered through renderMarkdown(), which
        // pipes the output through DOMPurify before it ever reaches the DOM.
        dangerouslySetInnerHTML={{ __html: renderMarkdown(bean.body) }}
      />

      <section className="bean-detail-section">
        <h2 className="bean-detail-section-title">Edit body</h2>
        <BodyEditor value={bodyDraft} onChange={setBodyDraft} />
        <button type="button" disabled={bodyDraft === bean.body} onClick={saveBody}>
          Save body
        </button>
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

  const updateBean = useUpdateBean(project);
  const setParent = useSetParent(project);
  const addBlocking = useAddBlocking(project);
  const removeBlocking = useRemoveBlocking(project);
  const addBlockedBy = useAddBlockedBy(project);
  const removeBlockedBy = useRemoveBlockedBy(project);
  const deleteBean = useDeleteBean(project);
  const createBean = useCreateBean(project);

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
      updateBean={updateBean}
      setParent={setParent}
      addBlocking={addBlocking}
      removeBlocking={removeBlocking}
      addBlockedBy={addBlockedBy}
      removeBlockedBy={removeBlockedBy}
      deleteBean={deleteBean}
      createBean={createBean}
    />
  );
}
