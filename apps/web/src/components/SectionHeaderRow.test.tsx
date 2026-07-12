import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { SectionHeaderRow } from "./SectionHeaderRow.js";

import { renderWithRouter } from "../test/renderWithRouter.js";

const bean = { id: "m1", title: "Q3 launch", type: "milestone", status: "todo" } as never;

describe("SectionHeaderRow", () => {
  it("renders the bean as a link with type and status", async () => {
    renderWithRouter(
      <SectionHeaderRow project="p" bean={bean} collapsed hasChildren onToggle={vi.fn()} />,
    );
    expect((await screen.findByText("Q3 launch")).closest("a")).toHaveAttribute("href", "/p/p/m1");
    expect(screen.getByText("milestone")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Expand/ })).toBeInTheDocument();
  });

  it("does not render a caret when there are no children", async () => {
    renderWithRouter(
      <SectionHeaderRow project="p" bean={bean} collapsed hasChildren={false} onToggle={vi.fn()} />,
    );
    await screen.findByText("Q3 launch");
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
