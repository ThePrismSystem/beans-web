import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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
vi.mock("../hooks/useBeans.js", () => ({ useProjectBeans: useBeansMock }));
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
  blockedBy: [],
  blocksInbound: [],
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
  // useReopenAncestors is real (unlike the other mutation hooks, which are
  // mocked above), so it needs an actual QueryClient in the tree.
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return { ...view, router };
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

  it("edits and saves the body via the Edit toggle", async () => {
    const user = userEvent.setup();
    renderBeanDetail();

    await user.click(await screen.findByRole("button", { name: "Edit body" }));
    const textarea = screen.getByLabelText("Body");
    await user.clear(textarea);
    await user.type(textarea, "New body content");
    await user.click(screen.getByRole("button", { name: "Save body" }));

    expect(updateBeanMutate).toHaveBeenCalledWith({
      id: "t1",
      etag: "abc",
      input: { body: "New body content" },
    });
  });

  it("cancels body edits without saving", async () => {
    const user = userEvent.setup();
    renderBeanDetail();

    await user.click(await screen.findByRole("button", { name: "Edit body" }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(updateBeanMutate).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Edit body" })).toBeInTheDocument();
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

  it("closes the delete dialog without deleting when cancelled", async () => {
    const user = userEvent.setup();
    renderBeanDetail();

    await user.click(await screen.findByRole("button", { name: "Delete" }));
    const dialog = await screen.findByRole("alertdialog");
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));

    expect(deleteBeanMutate).not.toHaveBeenCalled();
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });

  it("navigates to the project list after a successful delete", async () => {
    deleteBeanMutate.mockImplementationOnce(
      (_vars: unknown, options: { onSuccess?: () => void }) => {
        options.onSuccess?.();
      },
    );
    const user = userEvent.setup();
    renderBeanDetail();

    await user.click(await screen.findByRole("button", { name: "Delete" }));
    const dialog = await screen.findByRole("alertdialog");
    await user.click(within(dialog).getByRole("button", { name: "Delete" }));

    expect(await screen.findByText("project list")).toBeInTheDocument();
  });

  it("closes the new bean form without submitting when cancelled", async () => {
    const user = userEvent.setup();
    renderBeanDetail();

    await user.click(await screen.findByRole("button", { name: "+ New bean" }));
    await screen.findByRole("heading", { name: "New bean" });
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(createBeanMutate).not.toHaveBeenCalled();
    expect(screen.queryByRole("heading", { name: "New bean" })).not.toBeInTheDocument();
  });

  it("closes the create form and navigates to the new bean on successful create", async () => {
    createBeanMutate.mockImplementationOnce(
      (_input: unknown, options: { onSuccess?: (created: { id: string }) => void }) => {
        options.onSuccess?.({ id: "new-bean-1" });
      },
    );
    const user = userEvent.setup();
    const { router } = renderBeanDetail();

    await user.click(await screen.findByRole("button", { name: "+ New bean" }));
    await user.type(screen.getByLabelText("Title"), "Sibling task");
    await user.click(screen.getByRole("button", { name: "Create bean" }));

    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/p/demo/new-bean-1");
    });
    expect(screen.queryByRole("heading", { name: "New bean" })).not.toBeInTheDocument();
  });

  it("dispatches relation changes to the mutation hooks", async () => {
    const user = userEvent.setup();
    renderBeanDetail();

    await user.click(await screen.findByRole("button", { name: /set parent/i }));
    await user.click(await screen.findByText("Other Milestone"));

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

  it("shows the raw value when a timestamp cannot be parsed", async () => {
    useBeanMock.mockReturnValue({
      data: { ...bean, createdAt: "not-a-date" },
      isPending: false,
      isError: false,
    });

    renderBeanDetail();

    expect(await screen.findByText(/Created not-a-date/)).toBeInTheDocument();
  });

  it("resyncs the body draft when navigating to a different bean id", async () => {
    const { router } = renderBeanDetail();
    await screen.findByText("Task One");

    const bean2: BeanDetail = { ...bean, id: "t2", title: "Task Two", body: "Body of task two" };
    useBeanMock.mockReturnValue({ data: bean2, isPending: false, isError: false });
    await router.navigate({ to: "/p/$project/$beanId", params: { project: "demo", beanId: "t2" } });
    await screen.findByText("Task Two");

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Edit body" }));

    expect(screen.getByLabelText("Body")).toHaveValue("Body of task two");
  });

  it("does not mutate when committing the title without changes", async () => {
    const user = userEvent.setup();
    renderBeanDetail();

    await user.click(await screen.findByText("Task One"));
    await user.keyboard("{Enter}");

    expect(updateBeanMutate).not.toHaveBeenCalled();
    expect(screen.getByText("Task One")).toBeInTheDocument();
  });

  it("cancels title editing without saving on Escape", async () => {
    const user = userEvent.setup();
    renderBeanDetail();

    await user.click(await screen.findByText("Task One"));
    await screen.findByLabelText("Title");
    await user.keyboard("{Escape}");

    expect(updateBeanMutate).not.toHaveBeenCalled();
    expect(screen.queryByLabelText("Title")).not.toBeInTheDocument();
  });

  it("does not mutate when tag edits normalize to the same list", async () => {
    const user = userEvent.setup();
    renderBeanDetail();

    await user.click(await screen.findByRole("button", { name: "Edit Tags" }));
    const tagsInput = screen.getByLabelText("Tags editor");
    fireEvent.change(tagsInput, { target: { value: "urgent," } });
    await user.click(screen.getByRole("button", { name: "Save Tags" }));

    expect(updateBeanMutate).not.toHaveBeenCalled();
  });

  it("shows a placeholder when the bean has no tags", async () => {
    useBeanMock.mockReturnValue({ data: { ...bean, tags: [] }, isPending: false, isError: false });

    renderBeanDetail();

    expect(await screen.findByText("—")).toBeInTheDocument();
  });

  it("does not mutate when saving the body without changes", async () => {
    const user = userEvent.setup();
    renderBeanDetail();

    await user.click(await screen.findByRole("button", { name: "Edit body" }));
    await user.click(screen.getByRole("button", { name: "Save body" }));

    expect(updateBeanMutate).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Edit body" })).toBeInTheDocument();
  });

  it("renders without crashing when the project bean list has not loaded yet", async () => {
    useBeansMock.mockReturnValue({ data: undefined, isPending: true, isError: false });

    renderBeanDetail();

    expect(await screen.findByText("Task One")).toBeInTheDocument();
  });

  it("dispatches addBlocking, removeBlocking, addBlockedBy, and removeBlockedBy to their mutation hooks", async () => {
    const blocker: Bean = { ...otherMilestone, id: "blk1", title: "Blocker One", type: "task" };
    const blockedBy: Bean = { ...otherMilestone, id: "bb1", title: "BlockedBy One", type: "task" };
    const addCandidate: Bean = {
      ...otherMilestone,
      id: "new1",
      title: "New Candidate",
      type: "task",
    };
    useBeanMock.mockReturnValue({
      data: { ...bean, blockingIds: [blocker.id], blockedByIds: [blockedBy.id] },
      isPending: false,
      isError: false,
    });
    useBeansMock.mockReturnValue({
      data: [otherMilestone, blocker, blockedBy, addCandidate],
      isPending: false,
      isError: false,
    });
    const user = userEvent.setup();

    renderBeanDetail();
    await screen.findByText("Task One");

    await user.click(screen.getByRole("button", { name: "Remove Blocker One from blocks" }));
    expect(removeBlockingMutate).toHaveBeenCalledWith({ id: "t1", targetId: "blk1" });

    await user.click(screen.getByRole("button", { name: "Remove BlockedBy One from blocked by" }));
    expect(removeBlockedByMutate).toHaveBeenCalledWith({ id: "t1", targetId: "bb1" });

    await user.click(screen.getByRole("button", { name: "Add blocks" }));
    await user.click(screen.getByLabelText("Select New Candidate"));
    await user.click(screen.getByRole("button", { name: /Add 1/ }));
    expect(addBlockingMutate).toHaveBeenCalledWith({ id: "t1", targetId: "new1" });

    await user.click(screen.getByRole("button", { name: "Add blocked by" }));
    await user.click(screen.getByLabelText("Select New Candidate"));
    await user.click(screen.getByRole("button", { name: /Add 1/ }));
    expect(addBlockedByMutate).toHaveBeenCalledWith({ id: "t1", targetId: "new1" });
  });

  it("removes an edge declared on the other bean by mutating that bean instead", async () => {
    // beans stores each blocking edge on one side only. Calling removeBlocking on
    // this bean for an edge declared elsewhere reports success and changes nothing,
    // so both of these must go out as the inverse mutation against the other bean.
    useBeanMock.mockReturnValue({
      data: {
        ...bean,
        blocksInbound: [{ id: "inb1", title: "Inbound Blocked", type: "task", status: "todo" }],
        blockedBy: [{ id: "inb2", title: "Inbound Blocker", type: "task", status: "todo" }],
      },
      isPending: false,
      isError: false,
    });
    useBeansMock.mockReturnValue({ data: [otherMilestone], isPending: false, isError: false });
    const user = userEvent.setup();

    renderBeanDetail();
    await screen.findByText("Task One");

    await user.click(screen.getByRole("button", { name: "Remove Inbound Blocked from blocks" }));
    expect(removeBlockedByMutate).toHaveBeenCalledWith({ id: "inb1", targetId: "t1" });
    expect(removeBlockingMutate).not.toHaveBeenCalled();

    await user.click(
      screen.getByRole("button", { name: "Remove Inbound Blocker from blocked by" }),
    );
    expect(removeBlockingMutate).toHaveBeenCalledWith({ id: "inb2", targetId: "t1" });
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

interface RenderDetailOptions {
  beanStatus: BeanDetail["status"];
  parentStatus: BeanDetail["status"];
  grandparentStatus?: BeanDetail["status"];
}

function renderDetail({
  beanStatus,
  parentStatus,
  grandparentStatus = "todo",
}: RenderDetailOptions) {
  const orphanBean: BeanDetail = {
    ...bean,
    id: "t-1",
    title: "Fix SSE reconnect",
    status: beanStatus,
    parentId: "e-1",
    parent: null,
    children: [],
  };
  const epic: Bean = {
    ...otherMilestone,
    id: "e-1",
    title: "Docker setup",
    type: "epic",
    status: parentStatus,
    parentId: "m-1",
  };
  const milestone: Bean = {
    ...otherMilestone,
    id: "m-1",
    title: "Q3 launch",
    status: grandparentStatus,
    parentId: null,
  };

  useBeanMock.mockReturnValue({
    data: orphanBean,
    isPending: false,
    isError: false,
    refetch: vi.fn(),
  });
  useBeansMock.mockReturnValue({ data: [epic, milestone], isPending: false, isError: false });

  const fetchMock = vi.fn((_url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body)) as { variables?: { id?: string } };
    return Promise.resolve(
      new Response(
        JSON.stringify({ data: { updateBean: { id: body.variables?.id ?? "", etag: "e" } } }),
        { headers: { "content-type": "application/json" } },
      ),
    );
  });
  vi.stubGlobal("fetch", fetchMock);

  renderBeanDetail("/p/demo/t-1");

  return { fetchMock };
}

describe("orphan warning", () => {
  it("renders no warning when the parent is open", async () => {
    renderDetail({ beanStatus: "todo", parentStatus: "todo" });
    await screen.findByText("Fix SSE reconnect");
    expect(screen.queryByRole("button", { name: /re-open/i })).not.toBeInTheDocument();
  });

  it("names the completed parent and offers a re-open button", async () => {
    renderDetail({ beanStatus: "in-progress", parentStatus: "completed" });
    expect(await screen.findByRole("button", { name: "Re-open parent" })).toBeInTheDocument();
    // RelationEditor also names the parent, so scope to the warning banner.
    expect(within(screen.getByRole("status")).getByText(/Docker setup/)).toBeInTheDocument();
  });

  it("closes the reopen dialog without reopening when cancelled", async () => {
    const user = userEvent.setup();
    renderDetail({ beanStatus: "in-progress", parentStatus: "completed" });

    await user.click(await screen.findByRole("button", { name: "Re-open parent" }));
    const dialog = await screen.findByRole("alertdialog");
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));

    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(await screen.findByRole("button", { name: "Re-open parent" })).toBeInTheDocument();
  });

  it("labels the button with the ancestor count when the chain is longer", async () => {
    renderDetail({
      beanStatus: "in-progress",
      parentStatus: "completed",
      grandparentStatus: "scrapped",
    });
    expect(await screen.findByRole("button", { name: "Re-open 2 ancestors" })).toBeInTheDocument();
  });

  it("lists every ancestor and its target status in the confirm dialog", async () => {
    const user = userEvent.setup();
    renderDetail({
      beanStatus: "in-progress",
      parentStatus: "completed",
      grandparentStatus: "scrapped",
    });

    await user.click(await screen.findByRole("button", { name: "Re-open 2 ancestors" }));

    const dialog = await screen.findByRole("alertdialog");
    expect(within(dialog).getByText(/e-1/)).toBeInTheDocument();
    expect(within(dialog).getByText(/m-1/)).toBeInTheDocument();
    expect(within(dialog).getAllByText(/in-progress/).length).toBeGreaterThan(0);
  });

  it("re-opens the ancestors on confirm, nearest first", async () => {
    const user = userEvent.setup();
    const { fetchMock } = renderDetail({
      beanStatus: "in-progress",
      parentStatus: "completed",
      grandparentStatus: "scrapped",
    });

    await user.click(await screen.findByRole("button", { name: "Re-open 2 ancestors" }));
    await user.click(within(await screen.findByRole("alertdialog")).getByText("Re-open"));

    await waitFor(() => {
      const updates = fetchMock.mock.calls
        .map(
          (call) =>
            JSON.parse(String((call[1] as RequestInit).body)) as {
              variables?: { id?: string; input?: { status?: string } };
            },
        )
        .filter((body) => body.variables?.input?.status !== undefined);
      expect(updates.map((u) => u.variables?.id)).toEqual(["e-1", "m-1"]);
      expect(updates[0]?.variables?.input?.status).toBe("in-progress");
    });
  });
});
