import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { RelationEditor } from "./RelationEditor.js";

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
  it("hides the parent control for milestones", () => {
    render(<RelationEditor bean={base} candidates={[]} onChange={() => {}} />);
    expect(screen.queryByLabelText(/parent/i)).not.toBeInTheDocument();
  });

  it("offers only valid parent types for an epic", () => {
    const epic = { ...base, type: "epic" as const };
    const candidates: Bean[] = [
      { ...base, id: "m1", type: "milestone", title: "M1" },
      { ...base, id: "e2", type: "epic", title: "E2" },
    ];
    render(<RelationEditor bean={epic} candidates={candidates} onChange={() => {}} />);
    const select = screen.getByLabelText(/parent/i);
    expect(select).toHaveTextContent("M1");
    expect(select).not.toHaveTextContent("E2"); // epics can't parent epics
  });

  it("dispatches a setParent change when a new parent is chosen", async () => {
    const epic = { ...base, id: "e1", type: "epic" as const };
    const candidates: Bean[] = [{ ...base, id: "m1", type: "milestone", title: "M1" }];
    const onChange = vi.fn();
    const user = userEvent.setup();

    render(<RelationEditor bean={epic} candidates={candidates} onChange={onChange} />);
    await user.selectOptions(screen.getByLabelText(/parent/i), "m1");

    expect(onChange).toHaveBeenCalledWith({ kind: "setParent", parentId: "m1" });
  });

  it("dispatches setParent with null when '(none)' is chosen", async () => {
    const epic = { ...base, id: "e1", type: "epic" as const, parentId: "m1" };
    const candidates: Bean[] = [{ ...base, id: "m1", type: "milestone", title: "M1" }];
    const onChange = vi.fn();
    const user = userEvent.setup();

    render(<RelationEditor bean={epic} candidates={candidates} onChange={onChange} />);
    await user.selectOptions(screen.getByLabelText(/parent/i), "");

    expect(onChange).toHaveBeenCalledWith({ kind: "setParent", parentId: null });
  });

  it("adds and removes blocking links", async () => {
    const task = { ...base, id: "t1", type: "task" as const, blockingIds: ["b1"] };
    const candidates: Bean[] = [
      { ...base, id: "b1", type: "task", title: "Blocked one" },
      { ...base, id: "b2", type: "task", title: "Blocked two" },
    ];
    const onChange = vi.fn();
    const user = userEvent.setup();

    render(<RelationEditor bean={task} candidates={candidates} onChange={onChange} />);

    expect(screen.getByRole("button", { name: /remove blocked one/i })).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText("Add to blocks"), "b2");
    expect(onChange).toHaveBeenCalledWith({ kind: "addBlocking", targetId: "b2" });

    await user.click(screen.getByRole("button", { name: /remove blocked one/i }));
    expect(onChange).toHaveBeenCalledWith({ kind: "removeBlocking", targetId: "b1" });
  });

  it("adds and removes blocked-by links", async () => {
    const task = { ...base, id: "t1", type: "task" as const, blockedByIds: ["b1"] };
    const candidates: Bean[] = [
      { ...base, id: "b1", type: "task", title: "Blocker one" },
      { ...base, id: "b2", type: "task", title: "Blocker two" },
    ];
    const onChange = vi.fn();
    const user = userEvent.setup();

    render(<RelationEditor bean={task} candidates={candidates} onChange={onChange} />);

    await user.selectOptions(screen.getByLabelText("Add to blocked by"), "b2");
    expect(onChange).toHaveBeenCalledWith({ kind: "addBlockedBy", targetId: "b2" });

    await user.click(screen.getByRole("button", { name: /remove blocker one/i }));
    expect(onChange).toHaveBeenCalledWith({ kind: "removeBlockedBy", targetId: "b1" });
  });
});
