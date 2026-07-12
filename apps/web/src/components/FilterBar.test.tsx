import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { FilterBar } from "./FilterBar.js";

import { EMPTY_BEAN_FILTER } from "../hooks/useBeans.js";

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
});
