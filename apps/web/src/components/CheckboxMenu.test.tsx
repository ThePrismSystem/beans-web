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
});
