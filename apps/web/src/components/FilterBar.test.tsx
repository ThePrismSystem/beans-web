import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { FilterBar } from "./FilterBar.js";

import { EMPTY_BEAN_FILTER } from "../lib/filter.js";

import type { BeanFilterInput } from "../lib/filter.js";

const props = { filter: EMPTY_BEAN_FILTER, prefixOptions: ["hhroot", "romn"], onChange: vi.fn() };

describe("FilterBar", () => {
  it("adds a type via the Type popover", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<FilterBar {...props} onChange={onChange} />);
    await user.click(screen.getByRole("button", { name: /Type/ }));
    await user.click(screen.getByLabelText("epic"));
    expect(onChange).toHaveBeenCalledWith({ ...EMPTY_BEAN_FILTER, type: ["epic"] });
  });

  it("adds a prefix from the dynamic options", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<FilterBar {...props} onChange={onChange} />);
    await user.click(screen.getByRole("button", { name: /Prefix/ }));
    await user.click(screen.getByLabelText("romn"));
    expect(onChange).toHaveBeenCalledWith({ ...EMPTY_BEAN_FILTER, prefix: ["romn"] });
  });

  it("reports search text", () => {
    const onChange = vi.fn();
    render(<FilterBar {...props} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText("Search beans"), { target: { value: "x" } });
    expect(onChange).toHaveBeenLastCalledWith({ ...EMPTY_BEAN_FILTER, search: "x" });
  });

  it("splits tags on comma", () => {
    const onChange = vi.fn();
    render(<FilterBar {...props} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText("Tags"), { target: { value: "a, b" } });
    expect(onChange).toHaveBeenLastCalledWith({ ...EMPTY_BEAN_FILTER, tags: ["a", "b"] });
  });

  it("shows the active filter count in the toggle label", () => {
    const filtered: BeanFilterInput = { ...EMPTY_BEAN_FILTER, type: ["epic"], status: ["todo"] };
    render(<FilterBar {...props} filter={filtered} />);
    expect(screen.getByRole("button", { name: "Filters (2)" })).toBeInTheDocument();
  });

  it("omits the count from the toggle label when no filters are active", () => {
    render(<FilterBar {...props} />);
    expect(screen.getByRole("button", { name: "Filters" })).toBeInTheDocument();
  });

  it("opens the advanced filters panel when the toggle is clicked", async () => {
    const user = userEvent.setup();
    const { container } = render(<FilterBar {...props} />);

    const toggle = screen.getByRole("button", { name: "Filters" });
    expect(container.querySelector(".filter-bar")).not.toHaveClass("filter-bar--open");

    await user.click(toggle);

    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(container.querySelector(".filter-bar")).toHaveClass("filter-bar--open");
  });
});
