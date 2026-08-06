import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useRef } from "react";
import { describe, expect, it, vi } from "vitest";

import { useDialogFocusTrap } from "./useDialogFocusTrap.js";

import type { ReactNode } from "react";

/**
 * ConfirmDialog and BeanPicker both always render at least one button, so the
 * degenerate surfaces below are only reachable through the hook itself. They
 * are still part of its contract: a shared trap must not throw or strand the
 * keyboard on a surface with nothing to focus.
 */
function Harness({
  open,
  onClose,
  attach = true,
  children,
}: {
  open: boolean;
  onClose: () => void;
  attach?: boolean;
  children?: ReactNode;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  useDialogFocusTrap({ dialogRef, open, onClose });
  return (
    <div>
      <button type="button">outside</button>
      {open && (
        <div ref={attach ? dialogRef : null} role="dialog" aria-label="harness">
          {children}
        </div>
      )}
    </div>
  );
}

describe("useDialogFocusTrap", () => {
  it("leaves Tab alone when the dialog holds nothing focusable", async () => {
    const user = userEvent.setup();
    render(
      <Harness open onClose={vi.fn()}>
        <p>nothing to focus in here</p>
      </Harness>,
    );
    const outside = screen.getByRole("button", { name: "outside" });
    outside.focus();

    await user.tab();

    // No cycle to wrap onto, so Tab walks off the only focusable element
    // instead of being pinned to it.
    expect(outside).not.toHaveFocus();
  });

  it("still closes on Escape when the dialog holds nothing focusable", async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(
      <Harness open onClose={onClose}>
        <p>nothing to focus in here</p>
      </Harness>,
    );

    await user.keyboard("{Escape}");

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("ignores Tab while the dialog element is unmounted, and still closes", async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(
      <Harness open attach={false} onClose={onClose}>
        <button type="button">inside</button>
      </Harness>,
    );
    screen.getByRole("button", { name: "outside" }).focus();

    await user.tab();
    expect(screen.getByRole("button", { name: "inside" })).toHaveFocus();

    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("registers nothing while closed", async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<Harness open={false} onClose={onClose} />);

    await user.keyboard("{Escape}");

    expect(onClose).not.toHaveBeenCalled();
  });

  describe("nested dialogs", () => {
    it("gives Escape to the innermost dialog only", async () => {
      const outer = vi.fn();
      const inner = vi.fn();
      const user = userEvent.setup();
      render(
        <Harness open onClose={outer}>
          <Harness open onClose={inner}>
            <button type="button">deep</button>
          </Harness>
        </Harness>,
      );

      await user.keyboard("{Escape}");

      // Every trap listens on the document, so an unstacked pair would close
      // the whole nest on one keypress.
      expect(inner).toHaveBeenCalledTimes(1);
      expect(outer).not.toHaveBeenCalled();
    });

    it("hands Escape back to the outer dialog once the inner one closes", async () => {
      const outer = vi.fn();
      const user = userEvent.setup();
      function Nest({ innerOpen }: { innerOpen: boolean }) {
        return (
          <Harness open onClose={outer}>
            <Harness open={innerOpen} onClose={vi.fn()}>
              <button type="button">deep</button>
            </Harness>
          </Harness>
        );
      }
      const { rerender } = render(<Nest innerOpen />);

      rerender(<Nest innerOpen={false} />);
      await user.keyboard("{Escape}");

      expect(outer).toHaveBeenCalledTimes(1);
    });
  });
});
