import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { EnumSelect } from "./EnumSelect.js";

const COLORS = ["red", "green", "blue"] as const;

describe("EnumSelect", () => {
  it("renders an option for each value", () => {
    render(<EnumSelect id="color" options={COLORS} value="red" onChange={vi.fn()} />);

    const select = screen.getByRole("combobox");
    expect(select).toHaveTextContent("red");
    expect(select).toHaveTextContent("green");
    expect(select).toHaveTextContent("blue");
  });

  it("applies the id prop", () => {
    render(<EnumSelect id="color" options={COLORS} value="red" onChange={vi.fn()} />);

    expect(document.getElementById("color")).toBe(screen.getByRole("combobox"));
  });

  it("applies the ariaLabel prop", () => {
    render(<EnumSelect ariaLabel="Pick a color" options={COLORS} value="red" onChange={vi.fn()} />);

    expect(screen.getByLabelText("Pick a color")).toBeInTheDocument();
  });

  it("calls onChange with the selected value", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<EnumSelect ariaLabel="Color" options={COLORS} value="red" onChange={onChange} />);

    await user.selectOptions(screen.getByLabelText("Color"), "blue");

    expect(onChange).toHaveBeenCalledWith("blue");
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("reflects the current value prop", () => {
    render(<EnumSelect ariaLabel="Color" options={COLORS} value="green" onChange={vi.fn()} />);

    expect(screen.getByLabelText("Color")).toHaveValue("green");
  });
});
