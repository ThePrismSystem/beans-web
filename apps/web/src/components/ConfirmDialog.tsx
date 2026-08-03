import { useEffect, useId, useRef, useState } from "react";

import type { KeyboardEvent as ReactKeyboardEvent, ReactNode } from "react";

const FOCUSABLE = 'button, input, select, textarea, [href], [tabindex]:not([tabindex="-1"])';

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /**
   * When set, the dialog collects free text and hands it to `onConfirm`. Used
   * for the scrap reason, which is appended to the bean body.
   */
  reasonLabel?: string;
  reasonPlaceholder?: string;
  onConfirm: (reason: string) => void;
  onCancel: () => void;
}

const REASON_ROWS = 4;

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  reasonLabel,
  reasonPlaceholder,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);
  const [reason, setReason] = useState("");
  const titleId = useId();
  const messageId = useId();
  const reasonId = useId();

  useEffect(() => {
    if (!open) {
      return;
    }
    // Remember what had focus so it can be restored when the dialog closes,
    // then move focus into the dialog — onto the reason field when there is
    // one, otherwise the non-destructive Cancel button.
    restoreFocusRef.current = document.activeElement as HTMLElement | null;
    dialogRef.current?.querySelector<HTMLElement>(FOCUSABLE)?.focus();
    return () => {
      restoreFocusRef.current?.focus();
    };
  }, [open]);

  // Each opening starts from an empty field rather than the last attempt's
  // text. Adjusted during render (not an effect) so the reset lands in the
  // same commit as the open transition.
  const [previousOpen, setPreviousOpen] = useState(open);
  if (open !== previousOpen) {
    setPreviousOpen(open);
    if (open) {
      setReason("");
    }
  }

  if (!open) {
    return null;
  }

  function handleKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      onCancel();
      return;
    }
    if (event.key !== "Tab") {
      return;
    }
    const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE);
    if (!focusable || focusable.length === 0) {
      return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (!first || !last) {
      return;
    }
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  // Dismissing on a stray backdrop click is fine for a bare confirm, but it
  // would throw away typed text without a word. With a reason entered, closing
  // has to be deliberate — and focus returns to the text so the refusal reads
  // as "your work is still here" rather than as a dead click.
  function handleBackdropClick() {
    if (reasonLabel && reason.trim().length > 0) {
      dialogRef.current?.querySelector<HTMLTextAreaElement>("textarea")?.focus();
      return;
    }
    onCancel();
  }

  return (
    <div className="confirm-dialog-backdrop" onClick={handleBackdropClick}>
      <div
        ref={dialogRef}
        className="confirm-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={message ? messageId : undefined}
        onClick={(event) => {
          event.stopPropagation();
        }}
        onKeyDown={handleKeyDown}
      >
        <h2 id={titleId}>{title}</h2>
        {message && (
          <div className="confirm-dialog-message" id={messageId}>
            {message}
          </div>
        )}
        {reasonLabel && (
          <>
            <label className="confirm-dialog-reason-label" htmlFor={reasonId}>
              {reasonLabel}
            </label>
            <textarea
              id={reasonId}
              className="confirm-dialog-reason"
              rows={REASON_ROWS}
              placeholder={reasonPlaceholder}
              value={reason}
              onChange={(event) => {
                setReason(event.target.value);
              }}
            />
          </>
        )}
        <div className="confirm-dialog-actions">
          <button type="button" onClick={onCancel}>
            {cancelLabel}
          </button>
          <button
            type="button"
            className="confirm-dialog-danger"
            onClick={() => {
              onConfirm(reason);
            }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
