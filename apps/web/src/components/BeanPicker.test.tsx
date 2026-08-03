import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { BeanPicker } from "./BeanPicker.js";

import type { BeanPickerProps } from "./BeanPicker.js";

const candidates = [
  { id: "e1", title: "Epic one", type: "epic", status: "todo" } as never,
  { id: "e2", title: "Epic two", type: "epic", status: "completed" } as never,
];

describe("BeanPicker", () => {
  it("renders nothing when closed", () => {
    render(
      <BeanPicker
        open={false}
        title="Set parent"
        candidates={candidates}
        mode="single"
        onPick={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(screen.queryByText("Set parent")).not.toBeInTheDocument();
  });

  it("hides completed candidates by default and picks one in single mode", async () => {
    const onPick = vi.fn();
    const user = userEvent.setup();
    render(
      <BeanPicker
        open
        title="Set parent"
        candidates={candidates}
        mode="single"
        allowNone
        onPick={onPick}
        onClose={vi.fn()}
      />,
    );
    expect(screen.queryByText("Epic two")).not.toBeInTheDocument(); // completed hidden
    await user.click(screen.getByText("Epic one"));
    expect(onPick).toHaveBeenCalledWith(["e1"]);
  });

  it("adds multiple in multi mode", async () => {
    const onPick = vi.fn();
    const user = userEvent.setup();
    render(
      <BeanPicker
        open
        title="Add blocks"
        candidates={candidates}
        mode="multi"
        onPick={onPick}
        onClose={vi.fn()}
      />,
    );
    await user.click(screen.getByLabelText("Select Epic one"));
    await user.click(screen.getByRole("button", { name: /Add 1/ }));
    expect(onPick).toHaveBeenCalledWith(["e1"]);
  });

  it("clears with the (none) row in single mode", async () => {
    const onPick = vi.fn();
    const user = userEvent.setup();
    render(
      <BeanPicker
        open
        title="Set parent"
        candidates={candidates}
        mode="single"
        allowNone
        onPick={onPick}
        onClose={vi.fn()}
      />,
    );
    await user.click(screen.getByText("— (none) —"));
    expect(onPick).toHaveBeenCalledWith([]);
  });

  it("closes on backdrop click and Escape", async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(
      <BeanPicker
        open
        title="Set parent"
        candidates={candidates}
        mode="single"
        onPick={vi.fn()}
        onClose={onClose}
      />,
    );
    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(1);

    await user.click(
      screen.getByRole("dialog", { name: "Set parent" }).parentElement as HTMLElement,
    );
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("filters candidates by search term", async () => {
    const onPick = vi.fn();
    const user = userEvent.setup();
    render(
      <BeanPicker
        open
        title="Set parent"
        candidates={candidates}
        mode="single"
        onPick={onPick}
        onClose={vi.fn()}
      />,
    );
    await user.type(screen.getByLabelText("Search beans"), "nope");
    expect(screen.queryByText("Epic one")).not.toBeInTheDocument();
  });

  it("filters candidates by type", async () => {
    const onPick = vi.fn();
    const user = userEvent.setup();
    render(
      <BeanPicker
        open
        title="Set parent"
        candidates={[
          { id: "e1", title: "Epic one", type: "epic", status: "todo" } as never,
          { id: "t1", title: "Task one", type: "task", status: "todo" } as never,
        ]}
        mode="single"
        onPick={onPick}
        onClose={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: /^Type/ }));
    await user.click(screen.getByLabelText("task"));

    expect(screen.queryByText("Epic one")).not.toBeInTheDocument();
    expect(screen.getByText("Task one")).toBeInTheDocument();
  });

  it("filters candidates by prefix", async () => {
    const onPick = vi.fn();
    const user = userEvent.setup();
    render(
      <BeanPicker
        open
        title="Set parent"
        candidates={[
          { id: "hh-1", title: "Alpha one", type: "epic", status: "todo" } as never,
          { id: "bn-1", title: "Beans one", type: "epic", status: "todo" } as never,
        ]}
        mode="single"
        onPick={onPick}
        onClose={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: /^Prefix/ }));
    await user.click(screen.getByLabelText("bn"));

    expect(screen.queryByText("Alpha one")).not.toBeInTheDocument();
    expect(screen.getByText("Beans one")).toBeInTheDocument();
  });

  it("unchecks a candidate that was already selected", async () => {
    const onPick = vi.fn();
    const user = userEvent.setup();
    render(
      <BeanPicker
        open
        title="Add blocks"
        candidates={candidates}
        mode="multi"
        onPick={onPick}
        onClose={vi.fn()}
      />,
    );

    const checkbox = screen.getByLabelText("Select Epic one");
    await user.click(checkbox);
    expect(checkbox).toBeChecked();

    await user.click(checkbox);
    expect(checkbox).not.toBeChecked();
    expect(screen.getByRole("button", { name: "Add 0" })).toBeDisabled();
  });

  it("resets selection when reopened", async () => {
    const onPick = vi.fn();
    const user = userEvent.setup();
    const props: BeanPickerProps = {
      open: true,
      title: "Add blocks",
      candidates,
      mode: "multi",
      onPick,
      onClose: vi.fn(),
    };
    const { rerender } = render(<BeanPicker {...props} />);

    await user.click(screen.getByLabelText("Select Epic one"));
    expect(screen.getByRole("button", { name: "Add 1" })).toBeInTheDocument();

    rerender(<BeanPicker {...props} open={false} />);
    rerender(<BeanPicker {...props} open={true} />);

    expect(screen.getByRole("button", { name: "Add 0" })).toBeDisabled();
    expect(screen.getByLabelText("Select Epic one")).not.toBeChecked();
  });

  it("moves focus into the dialog's search field when opened", async () => {
    const props: BeanPickerProps = {
      open: true,
      title: "Set parent",
      candidates,
      mode: "single",
      onPick: vi.fn(),
      onClose: vi.fn(),
    };
    render(<BeanPicker {...props} />);

    expect(await screen.findByLabelText("Search beans")).toHaveFocus();
  });

  it("restores focus to the opener when it closes", async () => {
    const props: BeanPickerProps = {
      open: false,
      title: "Set parent",
      candidates,
      mode: "single",
      onPick: vi.fn(),
      onClose: vi.fn(),
    };
    const { rerender } = render(
      <>
        <button type="button">opener</button>
        <BeanPicker {...props} />
      </>,
    );
    const opener = screen.getByRole("button", { name: "opener" });
    opener.focus();
    expect(opener).toHaveFocus();

    rerender(
      <>
        <button type="button">opener</button>
        <BeanPicker {...props} open={true} />
      </>,
    );
    expect(await screen.findByLabelText("Search beans")).toHaveFocus();

    rerender(
      <>
        <button type="button">opener</button>
        <BeanPicker {...props} open={false} />
      </>,
    );
    expect(opener).toHaveFocus();
  });

  it("traps Tab focus within the dialog", async () => {
    const user = userEvent.setup();
    render(
      <BeanPicker
        open
        title="Set parent"
        candidates={candidates}
        mode="single"
        onPick={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    const dialog = screen.getByRole("dialog", { name: "Set parent" });
    const focusable = dialog.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    );
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (!first || !last) {
      throw new Error("expected at least one focusable element");
    }

    last.focus();
    await user.tab();
    expect(first).toHaveFocus();

    first.focus();
    await user.tab({ shift: true });
    expect(last).toHaveFocus();
  });

  it("does not wrap Tab when focus is not on the last focusable element", async () => {
    const user = userEvent.setup();
    render(
      <BeanPicker
        open
        title="Set parent"
        candidates={candidates}
        mode="single"
        onPick={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    const dialog = screen.getByRole("dialog", { name: "Set parent" });
    const focusable = dialog.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    );
    const first = focusable[0];
    const second = focusable[1];
    if (!first || !second) {
      throw new Error("expected at least two focusable elements");
    }

    first.focus();
    await user.tab();
    expect(second).toHaveFocus();
  });

  it("does not wrap Shift+Tab when focus is not on the first focusable element", async () => {
    const user = userEvent.setup();
    render(
      <BeanPicker
        open
        title="Set parent"
        candidates={candidates}
        mode="single"
        onPick={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    const dialog = screen.getByRole("dialog", { name: "Set parent" });
    const focusable = dialog.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    );
    const secondToLast = focusable[focusable.length - 2];
    const last = focusable[focusable.length - 1];
    if (!secondToLast || !last) {
      throw new Error("expected at least two focusable elements");
    }

    last.focus();
    await user.tab({ shift: true });
    expect(secondToLast).toHaveFocus();
  });

  it("locks body scroll while open", () => {
    const props: BeanPickerProps = {
      open: true,
      title: "Set parent",
      candidates,
      mode: "single",
      onPick: vi.fn(),
      onClose: vi.fn(),
    };
    const { rerender, unmount } = render(<BeanPicker {...props} />);

    expect(document.body.style.overflow).toBe("hidden");

    rerender(<BeanPicker {...props} open={false} />);
    expect(document.body.style.overflow).not.toBe("hidden");

    rerender(<BeanPicker {...props} open={true} />);
    expect(document.body.style.overflow).toBe("hidden");

    unmount();
    expect(document.body.style.overflow).not.toBe("hidden");
  });
});
