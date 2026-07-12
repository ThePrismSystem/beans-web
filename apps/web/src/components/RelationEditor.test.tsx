import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { RelationEditor } from "./RelationEditor.js";
import { renderWithRouter } from "../test/renderWithRouter.js";

import type { Bean } from "@beans-frontend/shared";

const base: Bean = {
  id: "x1",
  slug: null,
  path: "",
  title: "t",
  status: "todo",
  type: "milestone",
  priority: "normal",
  tags: [],
  createdAt: "",
  updatedAt: "",
  body: "",
  etag: "e",
  parentId: null,
  blockingIds: [],
  blockedByIds: [],
};

describe("RelationEditor", () => {
  it("hides the parent control for milestones", async () => {
    renderWithRouter(<RelationEditor bean={base} candidates={[]} onChange={() => {}} />);
    expect(await screen.findByText("Blocks")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /set parent/i })).not.toBeInTheDocument();
  });

  it("sets a parent through the picker", async () => {
    const task = { ...base, id: "t1", type: "task" as const };
    const candidates: Bean[] = [
      { ...base, id: "f1", type: "feature", status: "todo", title: "Feature one" },
    ];
    const onChange = vi.fn();
    const user = userEvent.setup();

    renderWithRouter(<RelationEditor bean={task} candidates={candidates} onChange={onChange} />);

    await user.click(await screen.findByRole("button", { name: /set parent/i }));
    await user.click(screen.getByText("Feature one"));

    expect(onChange).toHaveBeenCalledWith({ kind: "setParent", parentId: "f1" });
  });

  it("clears the parent when '(none)' is chosen in the picker", async () => {
    const task = { ...base, id: "t1", type: "task" as const, parentId: "f1" };
    const candidates: Bean[] = [
      { ...base, id: "f1", type: "feature", status: "todo", title: "Feature one" },
    ];
    const onChange = vi.fn();
    const user = userEvent.setup();

    renderWithRouter(<RelationEditor bean={task} candidates={candidates} onChange={onChange} />);

    await user.click(await screen.findByRole("button", { name: /set parent/i }));
    await user.click(screen.getByText("— (none) —"));

    expect(onChange).toHaveBeenCalledWith({ kind: "setParent", parentId: null });
  });

  it("adds a blocking link through the multi-select picker", async () => {
    const task = { ...base, id: "t1", type: "task" as const };
    const candidates: Bean[] = [
      { ...base, id: "b1", type: "task", status: "todo", title: "Blocked one" },
    ];
    const onChange = vi.fn();
    const user = userEvent.setup();

    renderWithRouter(<RelationEditor bean={task} candidates={candidates} onChange={onChange} />);

    await user.click(await screen.findByRole("button", { name: /add blocks/i }));
    await user.click(screen.getByLabelText("Select Blocked one"));
    await user.click(screen.getByRole("button", { name: "Add 1" }));

    expect(onChange).toHaveBeenCalledWith({ kind: "addBlocking", targetId: "b1" });
  });

  it("removes an existing blocking link", async () => {
    const task = { ...base, id: "t1", type: "task" as const, blockingIds: ["b1"] };
    const candidates: Bean[] = [
      { ...base, id: "b1", type: "task", status: "todo", title: "Blocked one" },
    ];
    const onChange = vi.fn();
    const user = userEvent.setup();

    renderWithRouter(<RelationEditor bean={task} candidates={candidates} onChange={onChange} />);

    await user.click(await screen.findByRole("button", { name: "Remove Blocked one from blocks" }));

    expect(onChange).toHaveBeenCalledWith({ kind: "removeBlocking", targetId: "b1" });
  });

  it("removes an existing blocked-by link", async () => {
    const task = { ...base, id: "t1", type: "task" as const, blockedByIds: ["b1"] };
    const candidates: Bean[] = [
      { ...base, id: "b1", type: "task", status: "todo", title: "Blocker one" },
    ];
    const onChange = vi.fn();
    const user = userEvent.setup();

    renderWithRouter(<RelationEditor bean={task} candidates={candidates} onChange={onChange} />);

    await user.click(
      await screen.findByRole("button", { name: "Remove Blocker one from blocked by" }),
    );

    expect(onChange).toHaveBeenCalledWith({ kind: "removeBlockedBy", targetId: "b1" });
  });
});
