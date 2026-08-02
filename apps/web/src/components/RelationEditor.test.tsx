import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { RelationEditor } from "./RelationEditor.js";
import { renderWithRouter } from "../test/renderWithRouter.js";

import type { Bean, BeanDetail, LinkedBean } from "@beans-frontend/shared";

const base: BeanDetail = {
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
  parent: null,
  children: [],
  blockedBy: [],
  blocksInbound: [],
};

function linked(id: string, title: string): LinkedBean {
  return { id, title, type: "task", status: "todo" };
}

function render(bean: BeanDetail, candidates: Bean[] = [], onChange = vi.fn()) {
  renderWithRouter(
    <RelationEditor project="p" bean={bean} candidates={candidates} onChange={onChange} />,
  );
  return onChange;
}

describe("RelationEditor", () => {
  it("hides the parent control for milestones", async () => {
    render(base);
    expect(await screen.findByText("Blocks")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /set parent/i })).not.toBeInTheDocument();
  });

  it("sets a parent through the picker", async () => {
    const task = { ...base, id: "t1", type: "task" as const };
    const candidates: Bean[] = [
      { ...base, id: "f1", type: "feature", status: "todo", title: "Feature one" },
    ];
    const user = userEvent.setup();
    const onChange = render(task, candidates);

    await user.click(await screen.findByRole("button", { name: /set parent/i }));
    await user.click(screen.getByText("Feature one"));

    expect(onChange).toHaveBeenCalledWith({ kind: "setParent", parentId: "f1" });
  });

  it("clears the parent when '(none)' is chosen in the picker", async () => {
    const task = { ...base, id: "t1", type: "task" as const, parentId: "f1" };
    const candidates: Bean[] = [
      { ...base, id: "f1", type: "feature", status: "todo", title: "Feature one" },
    ];
    const user = userEvent.setup();
    const onChange = render(task, candidates);

    await user.click(await screen.findByRole("button", { name: /set parent/i }));
    await user.click(screen.getByText("— (none) —"));

    expect(onChange).toHaveBeenCalledWith({ kind: "setParent", parentId: null });
  });

  it("adds a blocking link through the multi-select picker", async () => {
    const task = { ...base, id: "t1", type: "task" as const };
    const candidates: Bean[] = [
      { ...base, id: "b1", type: "task", status: "todo", title: "Blocked one" },
    ];
    const user = userEvent.setup();
    const onChange = render(task, candidates);

    await user.click(await screen.findByRole("button", { name: /add blocks/i }));
    await user.click(screen.getByLabelText("Select Blocked one"));
    await user.click(screen.getByRole("button", { name: "Add 1" }));

    expect(onChange).toHaveBeenCalledWith({ kind: "addBlocking", targetId: "b1" });
  });
});

describe("RelationEditor union of both edge directions", () => {
  it("lists beans this one declares it blocks alongside beans that declare they are blocked by it", async () => {
    const task = {
      ...base,
      id: "t1",
      type: "task" as const,
      blockingIds: ["own1"],
      blocking: [linked("own1", "Declared here")],
      blocksInbound: [linked("inb1", "Declared elsewhere")],
    };
    render(task, [{ ...base, id: "own1", type: "task", title: "Declared here" }]);

    expect(await screen.findByRole("link", { name: /Declared here/ })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Declared elsewhere/ })).toBeInTheDocument();
  });

  it("lists both directions of blocked by under a single heading", async () => {
    const task = {
      ...base,
      id: "t1",
      type: "task" as const,
      blockedByIds: ["own1"],
      blockedBy: [linked("inb1", "Blocks me from elsewhere")],
    };
    render(task, [{ ...base, id: "own1", type: "task", title: "Blocks me from here" }]);

    expect(await screen.findByRole("link", { name: /Blocks me from here/ })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Blocks me from elsewhere/ })).toBeInTheDocument();
    expect(screen.getAllByText("Blocked by")).toHaveLength(1);
  });

  it("shows an edge declared on both sides only once", async () => {
    const task = {
      ...base,
      id: "t1",
      type: "task" as const,
      blockedByIds: ["b1"],
      blockedBy: [linked("b1", "Both sides")],
    };
    render(task, [{ ...base, id: "b1", type: "task", title: "Both sides" }]);

    expect(await screen.findAllByRole("link", { name: /Both sides/ })).toHaveLength(1);
  });

  it("renders children, which previously only appeared in the separate linked list", async () => {
    const feature = {
      ...base,
      id: "f1",
      type: "feature" as const,
      children: [linked("c1", "A child")],
    };
    render(feature);

    expect(await screen.findByRole("link", { name: /A child/ })).toBeInTheDocument();
  });

  it("renders the parent as a link rather than bare text", async () => {
    const task = {
      ...base,
      id: "t1",
      type: "task" as const,
      parentId: "f1",
      parent: linked("f1", "Parent feature"),
    };
    render(task);

    expect(await screen.findByRole("link", { name: /Parent feature/ })).toBeInTheDocument();
  });
});

describe("RelationEditor removal dispatches by which side declared the edge", () => {
  it("removes an own-declared blocking link", async () => {
    const task = {
      ...base,
      id: "t1",
      type: "task" as const,
      blockingIds: ["b1"],
      blocking: [linked("b1", "Blocked one")],
    };
    const user = userEvent.setup();
    const onChange = render(task, [{ ...base, id: "b1", type: "task", title: "Blocked one" }]);

    await user.click(await screen.findByRole("button", { name: "Remove Blocked one from blocks" }));

    expect(onChange).toHaveBeenCalledWith({
      kind: "removeBlocking",
      targetId: "b1",
      origin: "own",
    });
  });

  it("marks an inbound blocking link so the caller can issue the inverse mutation", async () => {
    const task = {
      ...base,
      id: "t1",
      type: "task" as const,
      blocksInbound: [linked("b1", "Blocked one")],
    };
    const user = userEvent.setup();
    const onChange = render(task);

    await user.click(await screen.findByRole("button", { name: "Remove Blocked one from blocks" }));

    expect(onChange).toHaveBeenCalledWith({
      kind: "removeBlocking",
      targetId: "b1",
      origin: "inbound",
    });
  });

  it("removes an own-declared blocked-by link", async () => {
    const task = {
      ...base,
      id: "t1",
      type: "task" as const,
      blockedByIds: ["b1"],
    };
    const user = userEvent.setup();
    const onChange = render(task, [{ ...base, id: "b1", type: "task", title: "Blocker one" }]);

    await user.click(
      await screen.findByRole("button", { name: "Remove Blocker one from blocked by" }),
    );

    expect(onChange).toHaveBeenCalledWith({
      kind: "removeBlockedBy",
      targetId: "b1",
      origin: "own",
    });
  });

  it("marks an inbound blocked-by link so the caller can issue the inverse mutation", async () => {
    const task = {
      ...base,
      id: "t1",
      type: "task" as const,
      blockedBy: [linked("b1", "Blocker one")],
    };
    const user = userEvent.setup();
    const onChange = render(task);

    await user.click(
      await screen.findByRole("button", { name: "Remove Blocker one from blocked by" }),
    );

    expect(onChange).toHaveBeenCalledWith({
      kind: "removeBlockedBy",
      targetId: "b1",
      origin: "inbound",
    });
  });
});
