import {
  BEAN_PRIORITIES,
  BEAN_STATUSES,
  BEAN_TYPES,
  canParent,
  validParentTypes,
} from "@beans-frontend/shared";
import { useRef, useState } from "react";

import { EnumSelect } from "./EnumSelect.js";

import type { CreateBeanInput } from "../api/generated.js";
import type { BeanListItem, BeanPriority, BeanStatus, BeanType } from "@beans-frontend/shared";
import type { ChangeEvent, SubmitEvent } from "react";

const TITLE_ERROR_ID = "create-bean-title-error";

export interface CreateBeanFormProps {
  candidates: BeanListItem[];
  defaultParentId?: string | null;
  onSubmit: (input: Partial<CreateBeanInput>) => void;
  onCancel?: () => void;
}

/**
 * Reconciles a pre-filled parent with a valid child type so the form can never
 * open in a hierarchy-violating state. If the pre-filled parent admits at least
 * one child type, the new bean defaults to the first such type and keeps the
 * parent; if the parent's type admits no children (task/bug), the parent is
 * cleared and the form opens blank with the default "task" type.
 */
function resolveInitialTypeAndParent(
  candidates: BeanListItem[],
  defaultParentId: string | null,
): { type: BeanType; parentId: string } {
  if (defaultParentId) {
    const parent = candidates.find((candidate) => candidate.id === defaultParentId);
    if (parent) {
      const childType = BEAN_TYPES.find((option) => canParent(option, parent.type));
      if (childType) {
        return { type: childType, parentId: defaultParentId };
      }
    }
  }
  return { type: "task", parentId: "" };
}

export function CreateBeanForm({
  candidates,
  defaultParentId,
  onSubmit,
  onCancel,
}: CreateBeanFormProps) {
  const [title, setTitle] = useState("");
  const [initial] = useState(() =>
    resolveInitialTypeAndParent(candidates, defaultParentId ?? null),
  );
  const [type, setType] = useState<BeanType>(initial.type);
  const [parentId, setParentId] = useState(initial.parentId);
  const [status, setStatus] = useState<BeanStatus>("todo");
  const [priority, setPriority] = useState<BeanPriority>("normal");
  const [tags, setTags] = useState("");
  const [body, setBody] = useState("");
  const [titleError, setTitleError] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);

  const parentOptions = candidates.filter((candidate) => canParent(type, candidate.type));
  // Show the parent control iff the selected type can have a parent at all
  // (hidden only for milestones), regardless of whether the project currently
  // has candidate parents of the right type — matching RelationEditor.
  const showParent = validParentTypes(type) !== null;

  function handleTypeChange(nextType: BeanType) {
    setType(nextType);
    const stillValid = candidates.some(
      (candidate) => candidate.id === parentId && canParent(nextType, candidate.type),
    );
    if (!stillValid) {
      setParentId("");
    }
  }

  function handleParentChange(event: ChangeEvent<HTMLSelectElement>) {
    const nextParentId = event.target.value;
    // Only accept a parent that is a valid parent for the current type; any
    // other value (including a stale one) collapses to "(none)".
    const valid =
      nextParentId === "" ||
      candidates.some(
        (candidate) => candidate.id === nextParentId && canParent(type, candidate.type),
      );
    setParentId(valid ? nextParentId : "");
  }

  function handleTagsChange(event: ChangeEvent<HTMLInputElement>) {
    setTags(event.target.value);
  }

  function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setTitleError(true);
      // Without this, focus stays on the submit button and a screen reader
      // user is left at a control that appears to have done nothing.
      titleRef.current?.focus();
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
    // noValidate hands validation to handleSubmit: `required` below still tells
    // assistive tech the field is mandatory, but the browser's own bubble would
    // take over before the in-page error message is ever rendered or announced.
    <form className="create-bean-form" onSubmit={handleSubmit} noValidate>
      <div className="create-bean-field">
        <label htmlFor="create-bean-title">Title (required)</label>
        <input
          id="create-bean-title"
          ref={titleRef}
          type="text"
          required
          aria-invalid={titleError || undefined}
          aria-describedby={titleError ? TITLE_ERROR_ID : undefined}
          value={title}
          onChange={(event) => {
            setTitle(event.target.value);
            setTitleError(false);
          }}
        />
        {titleError && (
          <p className="create-bean-error" id={TITLE_ERROR_ID} role="alert">
            Title is required.
          </p>
        )}
      </div>

      <div className="create-bean-field">
        <label htmlFor="create-bean-type">Type</label>
        <EnumSelect
          id="create-bean-type"
          options={BEAN_TYPES}
          value={type}
          onChange={handleTypeChange}
        />
      </div>

      {showParent && (
        <div className="create-bean-field">
          <label htmlFor="create-bean-parent">Parent</label>
          <select id="create-bean-parent" value={parentId} onChange={handleParentChange}>
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
        <EnumSelect
          id="create-bean-status"
          options={BEAN_STATUSES}
          value={status}
          onChange={setStatus}
        />
      </div>

      <div className="create-bean-field">
        <label htmlFor="create-bean-priority">Priority</label>
        <EnumSelect
          id="create-bean-priority"
          options={BEAN_PRIORITIES}
          value={priority}
          onChange={setPriority}
        />
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
          onChange={(event) => {
            setBody(event.target.value);
          }}
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
