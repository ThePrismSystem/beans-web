import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { FilterBar } from "./FilterBar.js";

import { EMPTY_BEAN_FILTER } from "../hooks/useBeans.js";

describe("FilterBar", () => {
  it("reports a type selection", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<FilterBar filter={EMPTY_BEAN_FILTER} onChange={onChange} />);

    await user.selectOptions(screen.getByLabelText("Type"), "epic");

    expect(onChange).toHaveBeenCalledWith({ ...EMPTY_BEAN_FILTER, type: ["epic"] });
  });

  it("reports a status selection", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<FilterBar filter={EMPTY_BEAN_FILTER} onChange={onChange} />);

    await user.selectOptions(screen.getByLabelText("Status"), "in-progress");

    expect(onChange).toHaveBeenCalledWith({ ...EMPTY_BEAN_FILTER, status: ["in-progress"] });
  });

  it("reports a priority selection", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<FilterBar filter={EMPTY_BEAN_FILTER} onChange={onChange} />);

    await user.selectOptions(screen.getByLabelText("Priority"), "high");

    expect(onChange).toHaveBeenCalledWith({ ...EMPTY_BEAN_FILTER, priority: ["high"] });
  });

  it("splits a comma-separated tag input into a tags array", () => {
    const onChange = vi.fn();
    render(<FilterBar filter={EMPTY_BEAN_FILTER} onChange={onChange} />);

    fireEvent.change(screen.getByLabelText("Tags"), { target: { value: "a, b" } });

    expect(onChange).toHaveBeenLastCalledWith({ ...EMPTY_BEAN_FILTER, tags: ["a", "b"] });
  });

  it("reports search text", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<FilterBar filter={EMPTY_BEAN_FILTER} onChange={onChange} />);

    await user.type(screen.getByLabelText("Search beans"), "x");

    expect(onChange).toHaveBeenLastCalledWith({ ...EMPTY_BEAN_FILTER, search: "x" });
  });

  it("clears the type filter when 'All types' is re-selected", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<FilterBar filter={{ ...EMPTY_BEAN_FILTER, type: ["epic"] }} onChange={onChange} />);

    await user.selectOptions(screen.getByLabelText("Type"), "");

    expect(onChange).toHaveBeenCalledWith({ ...EMPTY_BEAN_FILTER, type: [] });
  });

  it("clears the status filter when 'All statuses' is re-selected", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<FilterBar filter={{ ...EMPTY_BEAN_FILTER, status: ["todo"] }} onChange={onChange} />);

    await user.selectOptions(screen.getByLabelText("Status"), "");

    expect(onChange).toHaveBeenCalledWith({ ...EMPTY_BEAN_FILTER, status: [] });
  });

  it("clears the priority filter when 'All priorities' is re-selected", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<FilterBar filter={{ ...EMPTY_BEAN_FILTER, priority: ["high"] }} onChange={onChange} />);

    await user.selectOptions(screen.getByLabelText("Priority"), "");

    expect(onChange).toHaveBeenCalledWith({ ...EMPTY_BEAN_FILTER, priority: [] });
  });

  it("clears tags when the tag input is emptied", () => {
    const onChange = vi.fn();
    render(<FilterBar filter={{ ...EMPTY_BEAN_FILTER, tags: ["a"] }} onChange={onChange} />);

    fireEvent.change(screen.getByLabelText("Tags"), { target: { value: "" } });

    expect(onChange).toHaveBeenLastCalledWith({ ...EMPTY_BEAN_FILTER, tags: [] });
  });

  it("toggles the mobile filter disclosure", async () => {
    const user = userEvent.setup();
    render(<FilterBar filter={EMPTY_BEAN_FILTER} onChange={vi.fn()} />);

    const toggle = screen.getByRole("button", { name: /^Filters/ });
    expect(toggle).toHaveAttribute("aria-expanded", "false");

    await user.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
  });

  it("shows the active filter count on the disclosure toggle", () => {
    render(
      <FilterBar
        filter={{ ...EMPTY_BEAN_FILTER, type: ["epic"], status: ["todo"] }}
        onChange={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: "Filters (2)" })).toBeInTheDocument();
  });
});
