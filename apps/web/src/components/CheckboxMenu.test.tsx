import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { CheckboxMenu } from "./CheckboxMenu.js";

const options = [
  { value: "epic", label: "epic" },
  { value: "task", label: "task" },
];

describe("CheckboxMenu", () => {
  it("shows a count and toggles values", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<CheckboxMenu label="Type" options={options} selected={["epic"]} onChange={onChange} />);

    const trigger = screen.getByRole("button", { name: /Type \(1\)/ });
    await user.click(trigger);
    await user.click(screen.getByLabelText("task"));

    expect(onChange).toHaveBeenCalledWith(["epic", "task"]);
  });

  it("removes a value when unchecked", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<CheckboxMenu label="Type" options={options} selected={["epic"]} onChange={onChange} />);
    await user.click(screen.getByRole("button", { name: /Type/ }));
    await user.click(screen.getByLabelText("epic"));
    expect(onChange).toHaveBeenCalledWith([]);
  });

  it("closes the list on Escape", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<CheckboxMenu label="Type" options={options} selected={["epic"]} onChange={onChange} />);
    await user.click(screen.getByRole("button", { name: /Type/ }));
    expect(screen.getByRole("group", { name: "Type" })).toBeInTheDocument();

    await user.keyboard("{Escape}");

    expect(screen.queryByRole("group", { name: "Type" })).not.toBeInTheDocument();
  });

  it("restores focus to the trigger when closed via Escape while focus was inside the list", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<CheckboxMenu label="Type" options={options} selected={["epic"]} onChange={onChange} />);
    const trigger = screen.getByRole("button", { name: /Type/ });

    await user.click(trigger);
    // Move focus into the list — closing unmounts this checkbox, so without
    // an explicit restore focus would fall back to <body>, not the trigger.
    screen.getByLabelText("task").focus();

    await user.keyboard("{Escape}");

    expect(trigger).toHaveFocus();
  });

  describe("keyboard navigation", () => {
    async function openMenu() {
      const user = userEvent.setup();
      render(
        <CheckboxMenu
          label="Status"
          options={[
            { value: "todo", label: "todo" },
            { value: "doing", label: "doing" },
            { value: "done", label: "done" },
          ]}
          selected={[]}
          onChange={vi.fn()}
        />,
      );
      await user.click(screen.getByRole("button", { name: /Status/ }));
      return { user, boxes: screen.getAllByRole("checkbox") };
    }

    it("is a disclosure, not a menu", async () => {
      await openMenu();

      const trigger = screen.getByRole("button", { name: /Status/ });
      // aria-haspopup="true" means "menu"; this popup is a group of checkboxes.
      expect(trigger).not.toHaveAttribute("aria-haspopup");
      expect(trigger).toHaveAttribute("aria-expanded", "true");
      expect(trigger).toHaveAttribute("aria-controls", screen.getByRole("group").id);
    });

    it("moves down the options with ArrowDown and wraps at the end", async () => {
      const { user, boxes } = await openMenu();
      const first = boxes[0];
      if (!first) {
        throw new Error("expected at least one checkbox");
      }
      first.focus();

      await user.keyboard("{ArrowDown}");
      expect(boxes[1]).toHaveFocus();

      await user.keyboard("{ArrowDown}{ArrowDown}");
      expect(boxes[0]).toHaveFocus();
    });

    it("moves up with ArrowUp and wraps to the last option", async () => {
      const { user, boxes } = await openMenu();
      const first = boxes[0];
      if (!first) {
        throw new Error("expected at least one checkbox");
      }
      first.focus();

      await user.keyboard("{ArrowUp}");

      expect(boxes[2]).toHaveFocus();
    });

    it("jumps to the first and last options with Home and End", async () => {
      const { user, boxes } = await openMenu();
      const second = boxes[1];
      if (!second) {
        throw new Error("expected at least two checkboxes");
      }
      second.focus();

      await user.keyboard("{End}");
      expect(boxes[2]).toHaveFocus();

      await user.keyboard("{Home}");
      expect(boxes[0]).toHaveFocus();
    });

    it("still toggles with Space", async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();
      render(
        <CheckboxMenu
          label="Status"
          options={[{ value: "todo", label: "todo" }]}
          selected={[]}
          onChange={onChange}
        />,
      );
      await user.click(screen.getByRole("button", { name: /Status/ }));
      screen.getByRole("checkbox").focus();

      await user.keyboard(" ");

      expect(onChange).toHaveBeenCalledWith(["todo"]);
    });
  });
});
