import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { BeanPicker } from "./BeanPicker.js";

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
});
