import { useEffect } from "react";

import type { RefObject } from "react";

/**
 * Everything a modal's Tab cycle should visit. `querySelectorAll` reports
 * matches in document order whatever order the selectors are written in, so
 * the first and last entries bound the cycle.
 */
const FOCUSABLE = 'button, input, select, textarea, [href], [tabindex]:not([tabindex="-1"])';

export interface DialogFocusTrapOptions {
  /** The modal surface itself — the Tab cycle is everything focusable inside it. */
  dialogRef: RefObject<HTMLElement | null>;
  open: boolean;
  /** Called on Escape. Dialogs pass whichever of `onClose`/`onCancel` they own. */
  onClose: () => void;
  /**
   * Focused when the dialog opens; defaults to the first focusable element.
   * Pass one when the first element isn't where a keyboard user should land —
   * BeanPicker points this at its search field rather than the Close button.
   */
  initialFocusRef?: RefObject<HTMLElement | null>;
}

/**
 * The keyboard half of a modal dialog: Escape closes, Tab cycles inside
 * instead of escaping to the page behind, focus moves in on open and back to
 * the opener on close (WCAG 2.4.3).
 *
 * Listens on the document rather than on the dialog element so Escape still
 * works after a click on the dialog's own non-focusable chrome has left focus
 * on `<body>`. Tab is unaffected by the wider scope: the wrap only triggers
 * when the active element is the cycle's own first or last member.
 */
export function useDialogFocusTrap({
  dialogRef,
  open,
  onClose,
  initialFocusRef,
}: DialogFocusTrapOptions): void {
  useEffect(() => {
    if (!open) {
      return;
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
        return;
      }
      if (event.key !== "Tab") {
        return;
      }
      const dialog = dialogRef.current;
      if (!dialog) {
        return;
      }
      const focusable = dialog.querySelectorAll<HTMLElement>(FOCUSABLE);
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      // A dialog with nothing focusable has no cycle to wrap; leave Tab alone
      // rather than trapping the user on a surface they cannot leave.
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
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, onClose, dialogRef]);

  // Deliberately keyed on `open` alone: callers pass inline `onClose`
  // closures, and depending on that identity would re-run this effect — and so
  // yank focus back to the initial element — on every re-render of the parent.
  useEffect(() => {
    if (!open) {
      return;
    }
    const restoreTo = document.activeElement as HTMLElement | null;
    const initial =
      initialFocusRef?.current ?? dialogRef.current?.querySelector<HTMLElement>(FOCUSABLE);
    initial?.focus();
    return () => {
      restoreTo?.focus();
    };
  }, [open, dialogRef, initialFocusRef]);
}
