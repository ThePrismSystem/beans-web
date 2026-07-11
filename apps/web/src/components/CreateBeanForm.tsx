import { useState } from "react";

import { BEAN_PRIORITIES, BEAN_STATUSES, BEAN_TYPES, canParent } from "@beans-frontend/shared";

import type { CreateBeanInput } from "../api/generated.js";
import type { ChangeEvent, FormEvent } from "react";
import type { Bean, BeanPriority, BeanStatus, BeanType } from "@beans-frontend/shared";

export interface CreateBeanFormProps {
  candidates: Bean[];
  defaultParentId?: string | null;
  onSubmit: (input: Partial<CreateBeanInput>) => void;
  onCancel?: () => void;
}

export function CreateBeanForm({
  candidates,
  defaultParentId,
  onSubmit,
  onCancel,
}: CreateBeanFormProps) {
  const [title, setTitle] = useState("");
  const [type, setType] = useState<BeanType>("task");
  const [parentId, setParentId] = useState(defaultParentId ?? "");
  const [status, setStatus] = useState<BeanStatus>("todo");
  const [priority, setPriority] = useState<BeanPriority>("normal");
  const [tags, setTags] = useState("");
  const [body, setBody] = useState("");
  const [titleError, setTitleError] = useState(false);

  const parentOptions = candidates.filter((candidate) => canParent(type, candidate.type));
  const showParent = parentOptions.length > 0 || parentId !== "";

  function handleTypeChange(event: ChangeEvent<HTMLSelectElement>) {
    const nextType = BEAN_TYPES.find((option) => option === event.target.value);
    if (!nextType) {
      return;
    }
    setType(nextType);
    const stillValid = candidates.some(
      (candidate) => candidate.id === parentId && canParent(nextType, candidate.type),
    );
    if (!stillValid) {
      setParentId("");
    }
  }

  function handleTagsChange(event: ChangeEvent<HTMLInputElement>) {
    setTags(event.target.value);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setTitleError(true);
      return;
    }
    const tagList = tags
      .split(",")
      .map((tag) => tag.trim())
      .filter((tag) => tag.length > 0);

    onSubmit({
      title: trimmedTitle,
      type,
      status,
      priority,
      tags: tagList,
      body,
      parent: parentId || null,
    });
  }

  return (
    <form className="create-bean-form" onSubmit={handleSubmit}>
      <div className="create-bean-field">
        <label htmlFor="create-bean-title">Title</label>
        <input
          id="create-bean-title"
          type="text"
          value={title}
          onChange={(event) => {
            setTitle(event.target.value);
            setTitleError(false);
          }}
        />
        {titleError && <p className="create-bean-error">Title is required.</p>}
      </div>

      <div className="create-bean-field">
        <label htmlFor="create-bean-type">Type</label>
        <select id="create-bean-type" value={type} onChange={handleTypeChange}>
          {BEAN_TYPES.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </div>

      {showParent && (
        <div className="create-bean-field">
          <label htmlFor="create-bean-parent">Parent</label>
          <select
            id="create-bean-parent"
            value={parentId}
            onChange={(event) => setParentId(event.target.value)}
          >
            <option value="">(none)</option>
            {parentOptions.map((option) => (
              <option key={option.id} value={option.id}>
                {option.title}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="create-bean-field">
        <label htmlFor="create-bean-status">Status</label>
        <select
          id="create-bean-status"
          value={status}
          onChange={(event) => {
            const next = BEAN_STATUSES.find((option) => option === event.target.value);
            if (next) {
              setStatus(next);
            }
          }}
        >
          {BEAN_STATUSES.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </div>

      <div className="create-bean-field">
        <label htmlFor="create-bean-priority">Priority</label>
        <select
          id="create-bean-priority"
          value={priority}
          onChange={(event) => {
            const next = BEAN_PRIORITIES.find((option) => option === event.target.value);
            if (next) {
              setPriority(next);
            }
          }}
        >
          {BEAN_PRIORITIES.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </div>

      <div className="create-bean-field">
        <label htmlFor="create-bean-tags">Tags</label>
        <input id="create-bean-tags" type="text" value={tags} onChange={handleTagsChange} />
      </div>

      <div className="create-bean-field">
        <label htmlFor="create-bean-body">Body</label>
        <textarea
          id="create-bean-body"
          value={body}
          onChange={(event) => setBody(event.target.value)}
          rows={6}
        />
      </div>

      <div className="create-bean-actions">
        {onCancel && (
          <button type="button" onClick={onCancel}>
            Cancel
          </button>
        )}
        <button type="submit">Create bean</button>
      </div>
    </form>
  );
}
