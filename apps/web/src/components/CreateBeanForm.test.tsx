import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { CreateBeanForm } from "./CreateBeanForm.js";

import type { BeanListItem } from "@beans-web/shared";
import type { UserEvent } from "@testing-library/user-event";

/** The relation blocks render a chosen bean's title, or "(none)". */
function relation(name: "parent" | "blocking" | "blocked-by") {
  return screen.getByTestId(`create-bean-${name}`);
}

/**
 * Opens a picker and chooses beans by title. A picker row's accessible name is
 * built from its type tag, title and status dot, so rows are found by their
 * title text rather than by an assembled name.
 */
async function pick(user: UserEvent, opener: string, dialogTitle: string, ...titles: string[]) {
  await user.click(screen.getByRole("button", { name: opener }));
  const dialog = within(screen.getByRole("dialog", { name: dialogTitle }));
  for (const title of titles) {
    await user.click(dialog.getByText(title));
  }
  const add = dialog.queryByRole("button", { name: /^Add \d/ });
  if (add) {
    await user.click(add);
  }
}

const base: BeanListItem = {
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
  etag: "e",
  parentId: null,
  blockingIds: [],
  blockedByIds: [],
};

const candidates: BeanListItem[] = [
  { ...base, id: "m1", type: "milestone", title: "M1" },
  { ...base, id: "e2", type: "epic", title: "E2" },
];

describe("CreateBeanForm", () => {
  it("limits parent options to milestones when type is epic", async () => {
    const user = userEvent.setup();
    render(<CreateBeanForm candidates={candidates} onSubmit={vi.fn()} />);

    await user.selectOptions(screen.getByLabelText("Type"), "epic");
    await user.click(screen.getByRole("button", { name: "Set parent" }));

    const picker = within(screen.getByRole("dialog", { name: "Set parent" }));
    expect(picker.getByText("M1")).toBeInTheDocument();
    expect(picker.queryByText("E2")).not.toBeInTheDocument();
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

    await user.type(screen.getByLabelText("Title (required)"), "New epic");
    await user.selectOptions(screen.getByLabelText("Type"), "epic");
    await pick(user, "Set parent", "Set parent", "M1");
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
      blocking: [],
      blockedBy: [],
    });
  });

  it("submits the beans chosen in each blocking direction", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<CreateBeanForm candidates={candidates} onSubmit={onSubmit} />);

    await user.type(screen.getByLabelText("Title (required)"), "Wired task");
    await pick(user, "Add blocks", "Add blocks", "M1");
    await pick(user, "Add blocked by", "Add blocked by", "E2");
    await user.click(screen.getByRole("button", { name: "Create bean" }));

    // The two directions must not be crossed: M1 blocks, E2 blocked by.
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ blocking: ["m1"], blockedBy: ["e2"] }),
    );
  });

  it("drops a bean from its own picker once chosen, so it cannot be added twice", async () => {
    const user = userEvent.setup();
    render(<CreateBeanForm candidates={candidates} onSubmit={vi.fn()} />);

    await pick(user, "Add blocks", "Add blocks", "M1");
    await user.click(screen.getByRole("button", { name: "Add blocks" }));

    const picker = within(screen.getByRole("dialog", { name: "Add blocks" }));
    expect(picker.queryByText("M1")).not.toBeInTheDocument();
    expect(picker.getByText("E2")).toBeInTheDocument();
  });

  it("removes a chosen bean from the list and from the payload", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<CreateBeanForm candidates={candidates} onSubmit={onSubmit} />);

    await user.type(screen.getByLabelText("Title (required)"), "Wired task");
    await pick(user, "Add blocks", "Add blocks", "M1");
    expect(within(relation("blocking")).getByText("M1")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Remove M1 from blocks" }));
    await user.click(screen.getByRole("button", { name: "Create bean" }));

    expect(within(relation("blocking")).queryByText("M1")).not.toBeInTheDocument();
    expect(within(relation("blocking")).getByText("(none)")).toBeInTheDocument();
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ blocking: [] }));
  });

  it("pre-fills a valid child type and the parent for a milestone defaultParentId", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<CreateBeanForm candidates={candidates} defaultParentId="m1" onSubmit={onSubmit} />);

    // milestone can parent an epic (first valid child type in BEAN_TYPES order)
    expect(screen.getByLabelText("Type")).toHaveValue("epic");
    expect(within(relation("parent")).getByText("M1")).toBeInTheDocument();

    await user.type(screen.getByLabelText("Title (required)"), "Child epic");
    await user.click(screen.getByRole("button", { name: "Create bean" }));

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ type: "epic", parent: "m1" }));
  });

  it("clears a pre-filled parent whose type admits no children (task/bug)", async () => {
    const taskCandidates: BeanListItem[] = [
      { ...base, id: "tk1", type: "task", title: "Task One" },
    ];
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(
      <CreateBeanForm candidates={taskCandidates} defaultParentId="tk1" onSubmit={onSubmit} />,
    );

    // A task cannot be a parent, so parentId is cleared and type stays "task".
    expect(screen.getByLabelText("Type")).toHaveValue("task");
    expect(within(relation("parent")).getByText("(none)")).toBeInTheDocument();

    await user.type(screen.getByLabelText("Title (required)"), "Sibling task");
    await user.click(screen.getByRole("button", { name: "Create bean" }));

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ parent: null }));
  });

  it("starts blank when the pre-filled parent id matches no candidate", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(
      <CreateBeanForm
        candidates={candidates}
        defaultParentId="does-not-exist"
        onSubmit={onSubmit}
      />,
    );

    expect(screen.getByLabelText("Type")).toHaveValue("task");
    expect(within(relation("parent")).getByText("(none)")).toBeInTheDocument();

    await user.type(screen.getByLabelText("Title (required)"), "Orphan task");
    await user.click(screen.getByRole("button", { name: "Create bean" }));

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ parent: null }));
  });

  it("keeps the pre-filled parent selected when it still admits the newly chosen type", async () => {
    const user = userEvent.setup();
    render(<CreateBeanForm candidates={candidates} defaultParentId="m1" onSubmit={vi.fn()} />);

    expect(screen.getByLabelText("Type")).toHaveValue("epic");
    expect(within(relation("parent")).getByText("M1")).toBeInTheDocument();

    // "feature" can also parent under a milestone, so the pre-filled parent
    // should survive the type change instead of being cleared.
    await user.selectOptions(screen.getByLabelText("Type"), "feature");

    expect(within(relation("parent")).getByText("M1")).toBeInTheDocument();
  });

  it("sets a chosen status", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<CreateBeanForm candidates={candidates} onSubmit={onSubmit} />);

    await user.selectOptions(screen.getByLabelText("Status"), "in-progress");
    await user.type(screen.getByLabelText("Title (required)"), "In progress task");
    await user.click(screen.getByRole("button", { name: "Create bean" }));

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ status: "in-progress" }));
  });

  it("hides the parent control for the milestone type", async () => {
    const user = userEvent.setup();
    render(<CreateBeanForm candidates={candidates} onSubmit={vi.fn()} />);

    await user.selectOptions(screen.getByLabelText("Type"), "milestone");

    expect(screen.queryByRole("button", { name: "Set parent" })).not.toBeInTheDocument();
    expect(screen.queryByTestId("create-bean-parent")).not.toBeInTheDocument();
  });

  it("still renders the Parent control when no candidate parents exist for a non-milestone type", () => {
    // A task can have a parent; even with zero candidates, the Parent control
    // must render (offering only "(none)") — the field is hidden only for
    // milestones.
    render(<CreateBeanForm candidates={[]} onSubmit={vi.fn()} />);

    expect(screen.getByRole("button", { name: "Set parent" })).toBeInTheDocument();
    expect(within(relation("parent")).getByText("(none)")).toBeInTheDocument();
  });

  describe("required-title error reporting", () => {
    function renderForm() {
      const onSubmit = vi.fn();
      render(<CreateBeanForm candidates={[]} onSubmit={onSubmit} />);
      return { onSubmit, user: userEvent.setup() };
    }

    it("marks the title as required to assistive tech", () => {
      renderForm();

      expect(screen.getByLabelText("Title (required)")).toBeRequired();
    });

    it("announces the error and links it to the input on empty submit", async () => {
      const { user, onSubmit } = renderForm();

      await user.click(screen.getByRole("button", { name: "Create bean" }));

      const alert = screen.getByRole("alert");
      expect(alert).toHaveTextContent("Title is required.");
      const input = screen.getByLabelText("Title (required)");
      expect(input).toHaveAttribute("aria-invalid", "true");
      expect(input).toHaveAccessibleDescription("Title is required.");
      expect(onSubmit).not.toHaveBeenCalled();
    });

    it("moves focus to the invalid input so the failure is not silent", async () => {
      const { user } = renderForm();

      await user.click(screen.getByRole("button", { name: "Create bean" }));

      expect(screen.getByLabelText("Title (required)")).toHaveFocus();
    });

    it("clears the error and its wiring once the user types", async () => {
      const { user } = renderForm();
      await user.click(screen.getByRole("button", { name: "Create bean" }));
      expect(screen.getByRole("alert")).toBeInTheDocument();

      await user.type(screen.getByLabelText("Title (required)"), "a");

      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
      expect(screen.getByLabelText("Title (required)")).not.toHaveAttribute("aria-invalid");
    });

    it("rejects a whitespace-only title", async () => {
      const { user, onSubmit } = renderForm();

      await user.type(screen.getByLabelText("Title (required)"), "   ");
      await user.click(screen.getByRole("button", { name: "Create bean" }));

      expect(screen.getByRole("alert")).toBeInTheDocument();
      expect(onSubmit).not.toHaveBeenCalled();
    });
  });
});
