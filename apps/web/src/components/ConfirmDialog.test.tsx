import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { ConfirmDialog } from "./ConfirmDialog.js";

describe("ConfirmDialog", () => {
  it("renders nothing when closed", () => {
    render(<ConfirmDialog open={false} title="Delete?" onConfirm={vi.fn()} onCancel={vi.fn()} />);

    expect(screen.queryByText("Delete?")).not.toBeInTheDocument();
  });

  it("renders the title and message and calls onCancel", async () => {
    const onCancel = vi.fn();
    const user = userEvent.setup();
    render(
      <ConfirmDialog
        open
        title="Delete?"
        message="This cannot be undone."
        onConfirm={vi.fn()}
        onCancel={onCancel}
      />,
    );

    expect(screen.getByText("Delete?")).toBeInTheDocument();
    expect(screen.getByText("This cannot be undone.")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(onCancel).toHaveBeenCalled();
  });

  it("calls onConfirm with a custom confirm label", async () => {
    const onConfirm = vi.fn();
    const user = userEvent.setup();
    render(
      <ConfirmDialog
        open
        title="Delete?"
        confirmLabel="Delete"
        onConfirm={onConfirm}
        onCancel={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Delete" }));

    expect(onConfirm).toHaveBeenCalled();
  });

  it("does not call onCancel when clicking inside the dialog", async () => {
    const onCancel = vi.fn();
    const user = userEvent.setup();
    render(<ConfirmDialog open title="Delete?" onConfirm={vi.fn()} onCancel={onCancel} />);

    await user.click(screen.getByRole("alertdialog"));

    expect(onCancel).not.toHaveBeenCalled();
  });

  it("closes via onCancel when Escape is pressed", async () => {
    const onCancel = vi.fn();
    const user = userEvent.setup();
    render(<ConfirmDialog open title="Delete?" onConfirm={vi.fn()} onCancel={onCancel} />);

    await user.keyboard("{Escape}");

    expect(onCancel).toHaveBeenCalled();
  });

  it("wraps focus from the last button to the first on Tab", async () => {
    const user = userEvent.setup();
    render(<ConfirmDialog open title="Delete?" onConfirm={vi.fn()} onCancel={vi.fn()} />);

    const confirmButton = screen.getByRole("button", { name: "Confirm" });
    confirmButton.focus();
    expect(confirmButton).toHaveFocus();
    await user.tab();

    expect(screen.getByRole("button", { name: "Cancel" })).toHaveFocus();
  });

  it("wraps focus from the first button to the last on Shift+Tab", async () => {
    const user = userEvent.setup();
    render(<ConfirmDialog open title="Delete?" onConfirm={vi.fn()} onCancel={vi.fn()} />);

    const cancelButton = screen.getByRole("button", { name: "Cancel" });
    cancelButton.focus();
    expect(cancelButton).toHaveFocus();
    await user.tab({ shift: true });

    expect(screen.getByRole("button", { name: "Confirm" })).toHaveFocus();
  });

  describe("with a reason field", () => {
    function renderWithReason() {
      const onConfirm = vi.fn();
      const onCancel = vi.fn();
      render(
        <ConfirmDialog
          open
          title="Scrap this bean?"
          reasonLabel="Reason"
          confirmLabel="Scrap"
          onConfirm={onConfirm}
          onCancel={onCancel}
        />,
      );
      return { onConfirm, onCancel, user: userEvent.setup() };
    }

    it("hands the typed reason to onConfirm", async () => {
      const { user, onConfirm } = renderWithReason();

      await user.type(screen.getByLabelText("Reason"), "no longer needed");
      await user.click(screen.getByRole("button", { name: "Scrap" }));

      expect(onConfirm).toHaveBeenCalledWith("no longer needed");
    });

    it("focuses the reason field on open", () => {
      renderWithReason();

      expect(screen.getByLabelText("Reason")).toHaveFocus();
    });

    it("closes on a backdrop click while the reason is empty", async () => {
      const { user, onCancel } = renderWithReason();

      await user.click(document.querySelector(".confirm-dialog-backdrop")!);

      expect(onCancel).toHaveBeenCalled();
    });

    it("ignores a backdrop click once a reason has been typed", async () => {
      const { user, onCancel } = renderWithReason();
      await user.type(screen.getByLabelText("Reason"), "careful work");

      await user.click(document.querySelector(".confirm-dialog-backdrop")!);

      // Discarding typed text on a stray click, with no warning, loses work.
      expect(onCancel).not.toHaveBeenCalled();
    });

    it("still closes via the explicit Cancel button with a reason typed", async () => {
      const { user, onCancel } = renderWithReason();
      await user.type(screen.getByLabelText("Reason"), "careful work");

      await user.click(screen.getByRole("button", { name: "Cancel" }));

      expect(onCancel).toHaveBeenCalled();
    });

    it("starts from an empty field on each opening", async () => {
      const user = userEvent.setup();
      const props = {
        title: "Scrap this bean?",
        reasonLabel: "Reason",
        confirmLabel: "Scrap",
        onConfirm: vi.fn(),
        onCancel: vi.fn(),
      };
      const { rerender } = render(<ConfirmDialog open {...props} />);
      await user.type(screen.getByLabelText("Reason"), "first attempt");

      rerender(<ConfirmDialog open={false} {...props} />);
      rerender(<ConfirmDialog open {...props} />);

      expect(screen.getByLabelText("Reason")).toHaveValue("");
    });
  });
});
