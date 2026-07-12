import { render, screen, within } from "@testing-library/react";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { BeanDetailPage } from "./beanDetail.js";

import type { Bean } from "@beans-frontend/shared";
import type { BeanDetail } from "@beans-frontend/shared";

const {
  useBeanMock,
  useBeansMock,
  useUpdateBeanMock,
  useSetParentMock,
  useAddBlockingMock,
  useRemoveBlockingMock,
  useAddBlockedByMock,
  useRemoveBlockedByMock,
  useDeleteBeanMock,
  useCreateBeanMock,
  updateBeanMutate,
  setParentMutate,
  addBlockingMutate,
  removeBlockingMutate,
  addBlockedByMutate,
  removeBlockedByMutate,
  deleteBeanMutate,
  createBeanMutate,
} = vi.hoisted(() => ({
  useBeanMock: vi.fn(),
  useBeansMock: vi.fn(),
  useUpdateBeanMock: vi.fn(),
  useSetParentMock: vi.fn(),
  useAddBlockingMock: vi.fn(),
  useRemoveBlockingMock: vi.fn(),
  useAddBlockedByMock: vi.fn(),
  useRemoveBlockedByMock: vi.fn(),
  useDeleteBeanMock: vi.fn(),
  useCreateBeanMock: vi.fn(),
  updateBeanMutate: vi.fn(),
  setParentMutate: vi.fn(),
  addBlockingMutate: vi.fn(),
  removeBlockingMutate: vi.fn(),
  addBlockedByMutate: vi.fn(),
  removeBlockedByMutate: vi.fn(),
  deleteBeanMutate: vi.fn(),
  createBeanMutate: vi.fn(),
}));

vi.mock("../hooks/useBean.js", () => ({ useBean: useBeanMock }));
vi.mock("../hooks/useBeans.js", () => ({ useBeans: useBeansMock, EMPTY_BEAN_FILTER: {} }));
vi.mock("../hooks/useMutations.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../hooks/useMutations.js")>();
  return {
    ...actual,
    useUpdateBean: useUpdateBeanMock,
    useSetParent: useSetParentMock,
    useAddBlocking: useAddBlockingMock,
    useRemoveBlocking: useRemoveBlockingMock,
    useAddBlockedBy: useAddBlockedByMock,
    useRemoveBlockedBy: useRemoveBlockedByMock,
    useDeleteBean: useDeleteBeanMock,
    useCreateBean: useCreateBeanMock,
  };
});

const bean: BeanDetail = {
  id: "t1",
  slug: "task-one",
  path: "",
  title: "Task One",
  status: "in-progress",
  type: "task",
  priority: "high",
  tags: ["urgent"],
  createdAt: "2024-01-01T00:00:00Z",
  updatedAt: "2024-01-02T00:00:00Z",
  body: "**Bold body text** with `code`.",
  etag: "abc",
  parentId: "m1",
  blockingIds: [],
  blockedByIds: [],
  parent: { id: "m1", title: "Parent Milestone", type: "milestone", status: "todo" },
  children: [{ id: "c1", title: "Child Task", type: "task", status: "todo" }],
  blocking: [],
  blockedBy: [],
};

const otherMilestone: Bean = {
  id: "m2",
  slug: null,
  path: "",
  title: "Other Milestone",
  status: "todo",
  type: "milestone",
  priority: "normal",
  tags: [],
  createdAt: "",
  updatedAt: "",
  body: "",
  etag: "m2-etag",
  parentId: null,
  blockingIds: [],
  blockedByIds: [],
};

function renderBeanDetail(initialLocation = "/p/demo/t1") {
  const rootRoute = createRootRoute();
  const beanRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/p/$project/$beanId",
    component: BeanDetailPage,
  });
  const projectRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/p/$project",
    component: () => <div>project list</div>,
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([beanRoute, projectRoute]),
    history: createMemoryHistory({ initialEntries: [initialLocation] }),
  });
  return render(<RouterProvider router={router} />);
}

beforeEach(() => {
  vi.clearAllMocks();
  useBeanMock.mockReturnValue({ data: bean, isPending: false, isError: false });
  useBeansMock.mockReturnValue({ data: [otherMilestone], isPending: false, isError: false });
  const idle = { error: null, isError: false, submittedAt: 0 };
  useUpdateBeanMock.mockReturnValue({ mutate: updateBeanMutate, ...idle });
  useSetParentMock.mockReturnValue({ mutate: setParentMutate, ...idle });
  useAddBlockingMock.mockReturnValue({ mutate: addBlockingMutate, ...idle });
  useRemoveBlockingMock.mockReturnValue({ mutate: removeBlockingMutate, ...idle });
  useAddBlockedByMock.mockReturnValue({ mutate: addBlockedByMutate, ...idle });
  useRemoveBlockedByMock.mockReturnValue({ mutate: removeBlockedByMutate, ...idle });
  useDeleteBeanMock.mockReturnValue({ mutate: deleteBeanMutate, ...idle });
  useCreateBeanMock.mockReturnValue({ mutate: createBeanMutate, ...idle });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("BeanDetailPage", () => {
  it("renders the title, sanitized body, and a linked child", async () => {
    renderBeanDetail();

    expect(await screen.findByText("Task One")).toBeInTheDocument();
    expect(screen.getByText("Bold body text")).toBeInTheDocument();
    expect(screen.getByText("Child Task").closest("a")).toHaveAttribute("href", "/p/demo/c1");
  });

  it("does not render raw script tags from the body", async () => {
    useBeanMock.mockReturnValue({
      data: { ...bean, body: "<script>window.xss = true;</script>Safe text" },
      isPending: false,
      isError: false,
    });

    renderBeanDetail();

    expect(await screen.findByText("Safe text")).toBeInTheDocument();
    expect(document.querySelector("script")).not.toBeInTheDocument();
  });

  it("shows a loading message while pending", async () => {
    useBeanMock.mockReturnValue({ data: undefined, isPending: true, isError: false });

    renderBeanDetail();

    expect(await screen.findByText("Loading bean…")).toBeInTheDocument();
  });

  it("shows an error message when the query fails", async () => {
    useBeanMock.mockReturnValue({ data: undefined, isPending: false, isError: true });

    renderBeanDetail();

    expect(await screen.findByText("Failed to load bean.")).toBeInTheDocument();
  });

  it("fires the update mutation when the title is edited", async () => {
    const user = userEvent.setup();

    renderBeanDetail();

    await user.click(await screen.findByText("Task One"));
    const input = screen.getByLabelText("Title");
    await user.clear(input);
    await user.type(input, "Renamed task");
    await user.keyboard("{Enter}");

    expect(updateBeanMutate).toHaveBeenCalledWith({
      id: "t1",
      etag: "abc",
      input: { title: "Renamed task" },
    });
  });

  it("fires the update mutation when the status changes", async () => {
    const user = userEvent.setup();
    renderBeanDetail();

    await user.click(await screen.findByRole("button", { name: "Edit Status" }));
    await user.selectOptions(screen.getByLabelText("Status editor"), "completed");
    await user.click(screen.getByRole("button", { name: "Save Status" }));

    expect(updateBeanMutate).toHaveBeenCalledWith({
      id: "t1",
      etag: "abc",
      input: { status: "completed" },
    });
  });

  it("fires the update mutation when the type changes", async () => {
    const user = userEvent.setup();
    renderBeanDetail();

    await user.click(await screen.findByRole("button", { name: "Edit Type" }));
    await user.selectOptions(screen.getByLabelText("Type editor"), "bug");
    await user.click(screen.getByRole("button", { name: "Save Type" }));

    expect(updateBeanMutate).toHaveBeenCalledWith({
      id: "t1",
      etag: "abc",
      input: { type: "bug" },
    });
  });

  it("fires the update mutation when the priority changes", async () => {
    const user = userEvent.setup();
    renderBeanDetail();

    await user.click(await screen.findByRole("button", { name: "Edit Priority" }));
    await user.selectOptions(screen.getByLabelText("Priority editor"), "low");
    await user.click(screen.getByRole("button", { name: "Save Priority" }));

    expect(updateBeanMutate).toHaveBeenCalledWith({
      id: "t1",
      etag: "abc",
      input: { priority: "low" },
    });
  });

  it("saves tags through the inline edit row", async () => {
    const user = userEvent.setup();
    renderBeanDetail();

    await user.click(await screen.findByRole("button", { name: "Edit Tags" }));
    const tagsInput = screen.getByLabelText("Tags editor");
    await user.clear(tagsInput);
    await user.type(tagsInput, "a, b");
    await user.click(screen.getByRole("button", { name: "Save Tags" }));

    expect(updateBeanMutate).toHaveBeenCalledWith({
      id: "t1",
      etag: "abc",
      input: { tags: ["a", "b"] },
    });
  });

  it("saves body edits through the body editor", async () => {
    const user = userEvent.setup();
    renderBeanDetail();

    const textarea = await screen.findByLabelText("Body");
    await user.clear(textarea);
    await user.type(textarea, "New body content");
    await user.click(screen.getByRole("button", { name: "Save body" }));

    expect(updateBeanMutate).toHaveBeenCalledWith({
      id: "t1",
      etag: "abc",
      input: { body: "New body content" },
    });
  });

  it("prompts for a reason and scraps the bean", async () => {
    const promptSpy = vi.spyOn(window, "prompt").mockReturnValue("no longer needed");
    const user = userEvent.setup();
    renderBeanDetail();

    await user.click(await screen.findByRole("button", { name: "Scrap" }));

    expect(promptSpy).toHaveBeenCalled();
    expect(updateBeanMutate).toHaveBeenCalledWith({
      id: "t1",
      etag: "abc",
      input: {
        status: "scrapped",
        bodyMod: { append: "## Reasons for Scrapping\n\nno longer needed", replace: null },
      },
    });
  });

  it("does not scrap when the prompt is cancelled", async () => {
    vi.spyOn(window, "prompt").mockReturnValue(null);
    const user = userEvent.setup();
    renderBeanDetail();

    await user.click(await screen.findByRole("button", { name: "Scrap" }));

    expect(updateBeanMutate).not.toHaveBeenCalled();
  });

  it("deletes the bean after confirming", async () => {
    const user = userEvent.setup();
    renderBeanDetail();

    await user.click(await screen.findByRole("button", { name: "Delete" }));
    const dialog = await screen.findByRole("alertdialog");
    await user.click(within(dialog).getByRole("button", { name: "Delete" }));

    expect(deleteBeanMutate).toHaveBeenCalledWith({ id: "t1" }, expect.anything());
  });

  it("dispatches relation changes to the mutation hooks", async () => {
    const user = userEvent.setup();
    renderBeanDetail();

    await user.selectOptions(await screen.findByLabelText("Parent"), "m2");

    expect(setParentMutate).toHaveBeenCalledWith({ id: "t1", parentId: "m2" });
  });

  it("does not pre-fill the parent when the current bean is a task (no valid child)", async () => {
    const user = userEvent.setup();
    renderBeanDetail();

    await user.click(await screen.findByRole("button", { name: "+ New bean" }));
    await user.type(screen.getByLabelText("Title"), "Sibling task");
    await user.click(screen.getByRole("button", { name: "Create bean" }));

    expect(createBeanMutate).toHaveBeenCalledTimes(1);
    const [input] = createBeanMutate.mock.calls[0] as [Record<string, unknown>];
    expect(input.parent).toBeNull();
    expect(input.title).toBe("Sibling task");
  });

  it("pre-fills a valid child type and the current bean as parent for a milestone", async () => {
    const milestoneBean: BeanDetail = {
      ...bean,
      id: "ms1",
      title: "Milestone One",
      type: "milestone",
      parentId: null,
      parent: null,
      children: [],
    };
    useBeanMock.mockReturnValue({ data: milestoneBean, isPending: false, isError: false });
    const user = userEvent.setup();

    renderBeanDetail("/p/demo/ms1");

    await user.click(await screen.findByRole("button", { name: "+ New bean" }));
    await user.type(screen.getByLabelText("Title"), "Child epic");
    await user.click(screen.getByRole("button", { name: "Create bean" }));

    expect(createBeanMutate).toHaveBeenCalledTimes(1);
    const [input] = createBeanMutate.mock.calls[0] as [Record<string, unknown>];
    expect(input.parent).toBe("ms1");
    expect(input.type).toBe("epic"); // first BEAN_TYPES entry that canParent under a milestone
    expect(input.title).toBe("Child epic");
  });

  it("shows a reload prompt for an etag conflict and clears it on reload", async () => {
    useUpdateBeanMock.mockReturnValue({
      mutate: updateBeanMutate,
      error: new Error("graphql: etag mismatch: provided a, current is b"),
      isError: true,
      submittedAt: 1,
    });
    const refetch = vi.fn();
    useBeanMock.mockReturnValue({ data: bean, isPending: false, isError: false, refetch });
    const user = userEvent.setup();

    renderBeanDetail();

    expect(
      await screen.findByText("This bean changed on disk — reload to see the latest."),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Reload" }));

    expect(refetch).toHaveBeenCalled();
  });

  it("shows the raw beans message for a non-conflict mutation error", async () => {
    useSetParentMock.mockReturnValue({
      mutate: setParentMutate,
      error: new Error("invalid parent for type task"),
      isError: true,
      submittedAt: 1,
    });

    renderBeanDetail();

    expect(await screen.findByText("invalid parent for type task")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Reload" })).not.toBeInTheDocument();
  });

  it("does not show a stale error once a later mutation succeeds", async () => {
    // updateBean failed earlier; setParent succeeded afterwards (higher submittedAt).
    useUpdateBeanMock.mockReturnValue({
      mutate: updateBeanMutate,
      error: new Error("invalid parent for type task"),
      isError: true,
      submittedAt: 1,
    });
    useSetParentMock.mockReturnValue({
      mutate: setParentMutate,
      error: null,
      isError: false,
      submittedAt: 2,
    });

    renderBeanDetail();

    await screen.findByText("Task One");
    expect(screen.queryByText("invalid parent for type task")).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
