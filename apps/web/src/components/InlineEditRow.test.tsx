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
          <select aria-label="Type editor" value={value} onChange={(e) => onValue(e.target.value)}>
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
});
