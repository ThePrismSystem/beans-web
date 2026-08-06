import { useId, useRef } from "react";

import { useDialogFocusTrap } from "../hooks/useDialogFocusTrap.js";
import { describeMutationError } from "../hooks/useMutations.js";

import { CreateBeanForm } from "./CreateBeanForm.js";

import type { CreateBeanFormProps } from "./CreateBeanForm.js";

export interface CreateBeanDialogProps extends Omit<CreateBeanFormProps, "onCancel"> {
  open: boolean;
  /**
   * The failed create, if the last attempt failed. It belongs in here rather
   * than in the page's mutation banner: the dialog stays open on failure, and
   * a banner rendered behind the backdrop reports the failure to nobody.
   */
  error?: Error | null;
  onClose: () => void;
}

export function CreateBeanDialog({ open, error, onClose, ...formProps }: CreateBeanDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = useId();

  useDialogFocusTrap({ dialogRef, open, onClose });

  if (!open) {
    return null;
  }

  return (
    // No dismiss-on-backdrop-click. This form holds more typing than any other
    // surface in the app — a title, a body, tags and three relations — and a
    // stray click outside would discard all of it without a word. Escape and
    // Cancel are both deliberate; a misdirected click is not.
    <div className="create-bean-backdrop">
      <div
        className="create-bean-dialog"
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <div className="create-bean-dialog-head">
          <h2 id={titleId}>New bean</h2>
          <button type="button" aria-label="Close" onClick={onClose}>
            ✕
          </button>
        </div>
        {error && (
          <p className="mutation-error" role="alert">
            {describeMutationError(error)}
          </p>
        )}
        <CreateBeanForm {...formProps} onCancel={onClose} />
      </div>
    </div>
  );
}
