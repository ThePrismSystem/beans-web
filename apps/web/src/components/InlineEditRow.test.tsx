import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { InlineEditRow } from "./InlineEditRow.js";

function renderRow(onSave = vi.fn()) {
  return {
    onSave,
    ...render(
      <InlineEditRow
        label="Type"
        display={<span>feature</span>}
        initialValue="feature"
        onSave={onSave}
        editor={({ value, onValue }) => (
          <select
            aria-label="Type editor"
            value={value}
            onChange={(e) => {
              onValue(e.target.value);
            }}
          >
            <option value="feature">feature</option>
            <option value="epic">epic</option>
          </select>
        )}
      />,
    ),
  };
}

describe("InlineEditRow", () => {
  it("shows Save only after the value changes, then saves", async () => {
    const user = userEvent.setup();
    const { onSave } = renderRow();
    await user.click(screen.getByRole("button", { name: "Edit Type" }));
    expect(screen.queryByRole("button", { name: "Save Type" })).not.toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText("Type editor"), "epic");
    await user.click(screen.getByRole("button", { name: "Save Type" }));
    expect(onSave).toHaveBeenCalledWith("epic");
  });

  it("cancel discards without saving", async () => {
    const user = userEvent.setup();
    const { onSave } = renderRow();
    await user.click(screen.getByRole("button", { name: "Edit Type" }));
    await user.selectOptions(screen.getByLabelText("Type editor"), "epic");
    await user.click(screen.getByRole("button", { name: "Cancel Type edit" }));
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Edit Type" })).toBeInTheDocument();
  });

  describe("focus management", () => {
    function renderRow(onSave = vi.fn()) {
      render(
        <InlineEditRow
          label="Status"
          display={<span>todo</span>}
          initialValue="todo"
          onSave={onSave}
          editor={({ value, onValue }) => (
            <input
              aria-label="Status editor"
              value={value}
              onChange={(event) => {
                onValue(event.target.value);
              }}
            />
          )}
        />,
      );
      return { onSave, user: userEvent.setup() };
    }

    it("moves focus into the editor when editing starts", async () => {
      const { user } = renderRow();

      await user.click(screen.getByRole("button", { name: "Edit Status" }));

      // Without this the pencil unmounts and focus falls to <body>, dropping
      // the keyboard user at the top of the document.
      expect(screen.getByLabelText("Status editor")).toHaveFocus();
      expect(document.body).not.toHaveFocus();
    });

    it("returns focus to the pencil after cancelling", async () => {
      const { user } = renderRow();
      await user.click(screen.getByRole("button", { name: "Edit Status" }));

      await user.click(screen.getByRole("button", { name: "Cancel Status edit" }));

      expect(screen.getByRole("button", { name: "Edit Status" })).toHaveFocus();
    });

    it("returns focus to the pencil after saving", async () => {
      const { user, onSave } = renderRow();
      await user.click(screen.getByRole("button", { name: "Edit Status" }));
      await user.type(screen.getByLabelText("Status editor"), "x");

      await user.click(screen.getByRole("button", { name: "Save Status" }));

      expect(onSave).toHaveBeenCalled();
      expect(screen.getByRole("button", { name: "Edit Status" })).toHaveFocus();
    });

    it("does not grab focus on first render", () => {
      renderRow();

      expect(document.body).toHaveFocus();
    });
  });
});
