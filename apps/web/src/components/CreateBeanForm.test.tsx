import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { CreateBeanForm } from "./CreateBeanForm.js";

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

const candidates: Bean[] = [
  { ...base, id: "m1", type: "milestone", title: "M1" },
  { ...base, id: "e2", type: "epic", title: "E2" },
];

describe("CreateBeanForm", () => {
  it("limits parent options to milestones when type is epic", async () => {
    const user = userEvent.setup();
    render(<CreateBeanForm candidates={candidates} onSubmit={vi.fn()} />);

    await user.selectOptions(screen.getByLabelText("Type"), "epic");

    const select = screen.getByLabelText("Parent");
    expect(select).toHaveTextContent("M1");
    expect(select).not.toHaveTextContent("E2");
  });

  it("requires a title before submitting", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<CreateBeanForm candidates={candidates} onSubmit={onSubmit} />);

    await user.click(screen.getByRole("button", { name: "Create bean" }));

    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByText("Title is required.")).toBeInTheDocument();
  });

  it("submits the entered fields", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<CreateBeanForm candidates={candidates} onSubmit={onSubmit} />);

    await user.type(screen.getByLabelText("Title"), "New epic");
    await user.selectOptions(screen.getByLabelText("Type"), "epic");
    await user.selectOptions(screen.getByLabelText("Parent"), "m1");
    await user.selectOptions(screen.getByLabelText("Priority"), "high");
    await user.type(screen.getByLabelText("Tags"), "a, b");
    await user.type(screen.getByLabelText("Body"), "details");
    await user.click(screen.getByRole("button", { name: "Create bean" }));

    expect(onSubmit).toHaveBeenCalledWith({
      title: "New epic",
      type: "epic",
      status: "todo",
      priority: "high",
      tags: ["a", "b"],
      body: "details",
      parent: "m1",
    });
  });

  it("pre-fills the parent with defaultParentId", () => {
    render(<CreateBeanForm candidates={candidates} defaultParentId="m1" onSubmit={vi.fn()} />);

    expect(screen.getByLabelText("Parent")).toHaveValue("m1");
  });
});
