import { useState } from "react";

import { renderMarkdown } from "../lib/markdown.js";

import type { ChangeEvent } from "react";

export interface BodyEditorProps {
  value: string;
  onChange: (value: string) => void;
}

export function BodyEditor({ value, onChange }: BodyEditorProps) {
  const [previewing, setPreviewing] = useState(false);

  function handleChange(event: ChangeEvent<HTMLTextAreaElement>) {
    onChange(event.target.value);
  }

  return (
    <div className="body-editor">
      <div className="body-editor-toolbar">
        <button type="button" onClick={() => setPreviewing((p) => !p)}>
          {previewing ? "Edit" : "Preview"}
        </button>
      </div>
      {previewing ? (
        <div
          className="body-editor-preview bean-detail-body"
          data-testid="body-editor-preview"
          // Preview mirrors the bean detail page's rendering: markdown ->
          // HTML piped through renderMarkdown()'s DOMPurify sanitize step.
          dangerouslySetInnerHTML={{ __html: renderMarkdown(value) }}
        />
      ) : (
        <textarea
          aria-label="Body"
          className="body-editor-textarea"
          value={value}
          onChange={handleChange}
          rows={12}
        />
      )}
    </div>
  );
}
