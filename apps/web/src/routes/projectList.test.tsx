import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { validateProjectSearch } from "../lib/projectSearch.js";

import { ProjectList } from "./projectList.js";

import type { BeanListItem } from "@beans-web/shared";

const { useBeansMock, useCreateBeanMock } = vi.hoisted(() => ({
  useBeansMock: vi.fn(),
  useCreateBeanMock: vi.fn(),
}));

vi.mock("../hooks/useBeans.js", async () => {
  const actual =
    await vi.importActual<typeof import("../hooks/useBeans.js")>("../hooks/useBeans.js");
  return { ...actual, useProjectBeans: useBeansMock };
});

vi.mock("../hooks/useMutations.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../hooks/useMutations.js")>();
  return { ...actual, useCreateBean: useCreateBeanMock };
});

const createBeanMutate = vi.fn();

const milestone: BeanListItem = {
  id: "m1",
  slug: null,
  path: "",
  title: "Milestone One",
  status: "todo",
  type: "milestone",
  priority: "normal",
  tags: [],
  createdAt: "",
  updatedAt: "",
  etag: "",
  parentId: null,
  blockingIds: [],
  blockedByIds: [],
};

const epic: BeanListItem = {
  ...milestone,
  id: "e1",
  title: "Epic One",
  type: "epic",
  parentId: "m1",
};

const task: BeanListItem = {
  ...milestone,
  id: "t1",
  title: "Task One",
  type: "task",
  parentId: "e1",
};

const bug: BeanListItem = {
  ...milestone,
  id: "b1",
  title: "Bug One",
  type: "bug",
  parentId: "e1",
};

const beans = [milestone, epic, task, bug];

function renderProjectList(initialLocation = "/p/testproj") {
  const rootRoute = createRootRoute();
  const projectRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/p/$project",
    validateSearch: validateProjectSearch,
    component: ProjectList,
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([projectRoute]),
    history: createMemoryHistory({ initialEntries: [initialLocation] }),
  });
  return { ...render(<RouterProvider router={router} />), router };
}

beforeEach(() => {
  window.localStorage.clear();
  vi.clearAllMocks();
  useCreateBeanMock.mockReturnValue({
    mutate: createBeanMutate,
    error: null,
    isError: false,
    submittedAt: 0,
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("ProjectList", () => {
  it("renders the hierarchy view by default with a milestone section header", async () => {
    useBeansMock.mockReturnValue({ data: beans, isPending: false, isError: false });

    renderProjectList();

    expect(await screen.findByText("Milestone One")).toBeInTheDocument();
  });

  it("switches to the flat view when the Flat toggle is clicked, and persists the choice", async () => {
    useBeansMock.mockReturnValue({ data: beans, isPending: false, isError: false });
    const user = userEvent.setup();

    renderProjectList();
    await screen.findByText("Milestone One");

    await user.click(screen.getByRole("button", { name: "Flat" }));

    // The flat view has no section headers/carets, unlike hierarchy view.
    expect(screen.queryByRole("button", { name: /Expand Milestone One/ })).not.toBeInTheDocument();
    expect(screen.getByText("Task One")).toBeInTheDocument();
    expect(window.localStorage.getItem("beans:view:testproj")).toBe("flat");
  });

  it("restores the persisted view mode on mount", async () => {
    window.localStorage.setItem("beans:view:testproj", "flat");
    useBeansMock.mockReturnValue({ data: beans, isPending: false, isError: false });

    renderProjectList();

    expect(await screen.findByText("Task One")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Expand Milestone One/ })).not.toBeInTheDocument();
  });

  it("offers a way to create the first bean in an empty project", async () => {
    useBeansMock.mockReturnValue({ data: [], isPending: false, isError: false });

    renderProjectList();

    // The whole point of the affordance: with no beans there is no bean detail
    // page to reach the create form from, so an empty project would otherwise
    // be a dead end.
    expect(await screen.findByRole("button", { name: "+ New bean" })).toBeInTheDocument();
  });

  it("opens the create dialog and closes it again", async () => {
    useBeansMock.mockReturnValue({ data: beans, isPending: false, isError: false });
    const user = userEvent.setup();

    renderProjectList();
    const opener = await screen.findByRole("button", { name: "+ New bean" });
    expect(opener).toHaveAttribute("aria-haspopup", "dialog");
    expect(screen.queryByRole("dialog", { name: "New bean" })).not.toBeInTheDocument();

    await user.click(opener);

    expect(screen.getByRole("dialog", { name: "New bean" })).toBeInTheDocument();
    expect(screen.getByLabelText("Title (required)")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.queryByRole("dialog", { name: "New bean" })).not.toBeInTheDocument();
    // Focus returns to the control that opened the dialog (WCAG 2.4.3).
    expect(opener).toHaveFocus();
  });

  it("closes the create dialog on Escape", async () => {
    useBeansMock.mockReturnValue({ data: beans, isPending: false, isError: false });
    const user = userEvent.setup();

    renderProjectList();
    await user.click(await screen.findByRole("button", { name: "+ New bean" }));
    expect(screen.getByRole("dialog", { name: "New bean" })).toBeInTheDocument();

    await user.keyboard("{Escape}");

    expect(screen.queryByRole("dialog", { name: "New bean" })).not.toBeInTheDocument();
  });

  it("Escape closes only the bean picker, leaving the dialog that opened it", async () => {
    useBeansMock.mockReturnValue({ data: beans, isPending: false, isError: false });
    const user = userEvent.setup();

    renderProjectList();
    await user.click(await screen.findByRole("button", { name: "+ New bean" }));
    await user.click(screen.getByRole("button", { name: "Set parent" }));
    expect(screen.getByRole("dialog", { name: "Set parent" })).toBeInTheDocument();

    await user.keyboard("{Escape}");

    // Both traps listen on the document, so without a stack this one keypress
    // would take the create dialog down with the picker — losing the whole form.
    expect(screen.queryByRole("dialog", { name: "Set parent" })).not.toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "New bean" })).toBeInTheDocument();
  });

  it("reports a failed create inside the dialog, where the dialog has not closed", async () => {
    useBeansMock.mockReturnValue({ data: beans, isPending: false, isError: false });
    useCreateBeanMock.mockReturnValue({
      mutate: createBeanMutate,
      error: new Error("beans said no"),
      isError: true,
      submittedAt: 1,
    });
    const user = userEvent.setup();

    renderProjectList();
    await user.click(await screen.findByRole("button", { name: "+ New bean" }));

    const dialog = within(screen.getByRole("dialog", { name: "New bean" }));
    expect(dialog.getByRole("alert")).toHaveTextContent("beans said no");
  });

  it("creates a bean with no parent, since the project view has no bean in context", async () => {
    useBeansMock.mockReturnValue({ data: beans, isPending: false, isError: false });
    const user = userEvent.setup();

    renderProjectList();
    await user.click(await screen.findByRole("button", { name: "+ New bean" }));
    await user.type(screen.getByLabelText("Title (required)"), "Fresh task");
    await user.click(screen.getByRole("button", { name: "Create bean" }));

    expect(createBeanMutate).toHaveBeenCalledTimes(1);
    expect(createBeanMutate.mock.calls[0]?.[0]).toMatchObject({
      title: "Fresh task",
      parent: null,
    });
  });

  it("offers every bean as a parent, so a child can be created without opening its parent", async () => {
    useBeansMock.mockReturnValue({ data: beans, isPending: false, isError: false });
    const user = userEvent.setup();

    renderProjectList();
    await user.click(await screen.findByRole("button", { name: "+ New bean" }));
    await user.click(screen.getByRole("button", { name: "Set parent" }));

    // Default type is "task", which milestones and epics may parent but tasks
    // and bugs may not — so the list is hierarchy-filtered, not the raw set.
    const picker = within(screen.getByRole("dialog", { name: "Set parent" }));
    expect(picker.getByText("Milestone One")).toBeInTheDocument();
    expect(picker.getByText("Epic One")).toBeInTheDocument();
    expect(picker.queryByText("Bug One")).not.toBeInTheDocument();
    expect(picker.queryByText("Task One")).not.toBeInTheDocument();
  });

  it("opens the form with no parent options while the project is still loading", async () => {
    // The header renders before either beans query resolves, so the form can
    // be opened with the candidate list still undefined.
    useBeansMock.mockReturnValue({ data: undefined, isPending: true, isError: false });
    const user = userEvent.setup();

    renderProjectList();
    await user.click(await screen.findByRole("button", { name: "+ New bean" }));

    expect(screen.getByLabelText("Title (required)")).toBeInTheDocument();
    expect(
      within(screen.getByTestId("create-bean-parent")).getByText("(none)"),
    ).toBeInTheDocument();
  });

  it("closes the form and opens the new bean once creation succeeds", async () => {
    useBeansMock.mockReturnValue({ data: beans, isPending: false, isError: false });
    createBeanMutate.mockImplementation(
      (_input: unknown, opts?: { onSuccess?: (created: { id: string }) => void }) => {
        opts?.onSuccess?.({ id: "n1" });
      },
    );
    const user = userEvent.setup();

    const { router } = renderProjectList();
    await user.click(await screen.findByRole("button", { name: "+ New bean" }));
    await user.type(screen.getByLabelText("Title (required)"), "Fresh task");
    await user.click(screen.getByRole("button", { name: "Create bean" }));

    expect(screen.queryByLabelText("Title (required)")).not.toBeInTheDocument();
    await vi.waitFor(() => {
      expect(router.state.location.pathname).toBe("/p/testproj/n1");
    });
  });

  it("shows a loading message while beans are pending", async () => {
    useBeansMock.mockReturnValue({ data: undefined, isPending: true, isError: false });

    renderProjectList();

    expect(await screen.findByText("Loading beans…")).toBeInTheDocument();
  });

  it("shows an error message when the beans query fails", async () => {
    useBeansMock.mockReturnValue({ data: undefined, isPending: false, isError: true });

    renderProjectList();

    expect(await screen.findByText("Failed to load beans.")).toBeInTheDocument();
  });

  it("switches back to the hierarchy view when the Hierarchy toggle is clicked", async () => {
    window.localStorage.setItem("beans:view:testproj", "flat");
    useBeansMock.mockReturnValue({ data: beans, isPending: false, isError: false });
    const user = userEvent.setup();

    renderProjectList();
    await screen.findByText("Task One");

    await user.click(screen.getByRole("button", { name: "Hierarchy" }));

    expect(await screen.findByText("Milestone One")).toBeInTheDocument();
    expect(window.localStorage.getItem("beans:view:testproj")).toBe("hierarchy");
  });

  it("filters the rendered list in the browser when a type filter is toggled", async () => {
    useBeansMock.mockReturnValue({ data: beans, isPending: false, isError: false });
    const user = userEvent.setup();

    renderProjectList();
    await screen.findByText("Milestone One");

    await user.click(screen.getByRole("button", { name: "Flat" }));
    await user.click(screen.getByRole("button", { name: /^Type/ }));
    await user.click(screen.getByRole("checkbox", { name: "task" }));

    expect(await screen.findByText("Task One")).toBeInTheDocument();
    expect(screen.queryByText("Bug One")).not.toBeInTheDocument();

    await user.click(screen.getByRole("checkbox", { name: "task" }));

    expect(await screen.findByText("Bug One")).toBeInTheDocument();
  });

  it("keeps ancestor sections visible when filtering by type in hierarchy view", async () => {
    useBeansMock.mockReturnValue({ data: beans, isPending: false, isError: false });
    const user = userEvent.setup();

    renderProjectList();
    await screen.findByText("Milestone One");

    await user.click(screen.getByRole("button", { name: /^Type/ }));
    await user.click(screen.getByRole("checkbox", { name: "task" }));

    expect(await screen.findByText("Milestone One")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Expand Milestone One" }));
    await user.click(screen.getByRole("button", { name: "Expand Epic One" }));

    expect(screen.getByText("Task One")).toBeInTheDocument();
    expect(screen.queryByText("Bug One")).not.toBeInTheDocument();
  });

  it("filters by status in the browser", async () => {
    // Server returns every bean; the open-status default hides the completed one.
    useBeansMock.mockReturnValue({
      data: [
        { ...milestone, id: "t-1", title: "Open One", status: "todo" },
        { ...milestone, id: "t-2", title: "Done Two", status: "completed" },
      ],
      isPending: false,
      isError: false,
    });

    renderProjectList();

    expect(await screen.findByText("Open One")).toBeInTheDocument();
    expect(screen.queryByText("Done Two")).not.toBeInTheDocument();
  });

  it("shows the sort control in both hierarchy and flat view", async () => {
    useBeansMock.mockReturnValue({ data: beans, isPending: false, isError: false });
    const user = userEvent.setup();

    renderProjectList();
    await screen.findByText("Milestone One");
    expect(screen.getByLabelText("Sort by")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Flat" }));

    expect(screen.getByLabelText("Sort by")).toBeInTheDocument();
  });

  it("sorts only the top-level hierarchy rows by title, leaving nested children alone", async () => {
    const cherryRoot: BeanListItem = { ...milestone, id: "cherry", title: "Cherry", type: "task" };
    const appleRoot: BeanListItem = { ...milestone, id: "apple", title: "Apple", type: "task" };
    const topLevelBeans = [milestone, epic, task, bug, cherryRoot, appleRoot];
    useBeansMock.mockReturnValue({ data: topLevelBeans, isPending: false, isError: false });

    renderProjectList("/p/testproj?sort=title");
    await screen.findByText("Milestone One");

    const topLevelRows = document.querySelectorAll(".hierarchy-roots > .hierarchy-node");
    const topLevelTitles = [...topLevelRows].map(
      (row) => row.querySelector(".bean-row-title")?.textContent,
    );
    expect(topLevelTitles).toEqual(["Apple", "Cherry", "Milestone One"]);
    expect(screen.getByLabelText("Sort by")).toHaveValue("title");
  });

  it("applies the default priority ordering to the flat view when no sort param is set", async () => {
    const lowPriority: BeanListItem = {
      ...milestone,
      id: "low-1",
      title: "Low Priority Task",
      type: "task",
      priority: "low",
    };
    const criticalPriority: BeanListItem = {
      ...milestone,
      id: "critical-1",
      title: "Critical Priority Task",
      type: "task",
      priority: "critical",
    };
    const normalPriority: BeanListItem = {
      ...milestone,
      id: "normal-1",
      title: "Normal Priority Task",
      type: "task",
      priority: "normal",
    };
    // Fetch order deliberately does not match priority order, so a passthrough
    // of raw fetch order (the old behavior) would fail this assertion.
    useBeansMock.mockReturnValue({
      data: [lowPriority, criticalPriority, normalPriority],
      isPending: false,
      isError: false,
    });
    window.localStorage.setItem("beans:view:testproj", "flat");

    renderProjectList();
    await screen.findByText("Critical Priority Task");

    const titles = screen
      .getAllByRole("listitem")
      .map((li) => within(li).getByText(/Priority Task$/).textContent);
    expect(titles).toEqual(["Critical Priority Task", "Normal Priority Task", "Low Priority Task"]);
    expect(screen.getByLabelText("Sort by")).toHaveValue("");
  });

  it("sorts the flat list by title when ?sort=title is present in the URL", async () => {
    window.localStorage.setItem("beans:view:testproj", "flat");
    useBeansMock.mockReturnValue({ data: beans, isPending: false, isError: false });

    renderProjectList("/p/testproj?sort=title");
    await screen.findByText("Task One");

    const titles = screen
      .getAllByRole("listitem")
      .map((li) => within(li).getByText(/One$/).textContent);
    expect(titles).toEqual(["Bug One", "Epic One", "Milestone One", "Task One"]);
    expect(screen.getByLabelText("Sort by")).toHaveValue("title");
  });

  it("updates the URL when the sort key or direction changes", async () => {
    useBeansMock.mockReturnValue({ data: beans, isPending: false, isError: false });
    const user = userEvent.setup();

    renderProjectList();
    await screen.findByText("Milestone One");
    await user.click(screen.getByRole("button", { name: "Flat" }));

    await user.selectOptions(screen.getByLabelText("Sort by"), "type");
    expect(screen.getByLabelText("Sort by")).toHaveValue("type");
    expect(screen.getByRole("button", { name: "Toggle sort direction" })).toHaveTextContent("↑");

    await user.click(screen.getByRole("button", { name: "Toggle sort direction" }));
    expect(screen.getByRole("button", { name: "Toggle sort direction" })).toHaveTextContent("↓");

    await user.selectOptions(screen.getByLabelText("Sort by"), "");
    expect(screen.getByLabelText("Sort by")).toHaveValue("");
    expect(screen.getByRole("button", { name: "Toggle sort direction" })).toBeDisabled();
  });

  it("keeps orphan badges and prefix options from the full dataset while a search is active", async () => {
    const closedParent: BeanListItem = {
      ...milestone,
      id: "p1",
      title: "Closed Parent",
      type: "epic",
      status: "completed",
      parentId: null,
    };
    const orphanChild: BeanListItem = {
      ...milestone,
      id: "c1",
      title: "Zzz No Match",
      type: "task",
      status: "todo",
      parentId: "p1",
    };
    const fullDataset = [closedParent, orphanChild];
    // Search hits only match `orphanChild` — `closedParent` drops out of the
    // server-filtered result, the way a real Bleve search would if the search
    // text only matched the child's title.
    const searchHits = [orphanChild];

    useBeansMock.mockImplementation((_project: string, search: string) =>
      search === ""
        ? { data: fullDataset, isPending: false, isError: false }
        : { data: searchHits, isPending: false, isError: false },
    );

    renderProjectList("/p/testproj?search=zzz");

    expect(await screen.findByText("Zzz No Match")).toBeInTheDocument();
    // Orphan badge must still render even though the closed parent isn't in
    // the search-hit set.
    expect(screen.getByText("orphaned")).toBeInTheDocument();
  });

  it("keeps ancestors visible when filtering by prefix in hierarchy view", async () => {
    useBeansMock.mockReturnValue({ data: beans, isPending: false, isError: false });
    const user = userEvent.setup();

    renderProjectList();
    await screen.findByText("Milestone One");

    await user.click(screen.getByRole("button", { name: /^Prefix/ }));
    await user.click(screen.getByRole("checkbox", { name: "t1" }));

    expect(await screen.findByText("Milestone One")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Expand Milestone One" }));
    await user.click(screen.getByRole("button", { name: "Expand Epic One" }));

    expect(screen.getByText("Task One")).toBeInTheDocument();
    expect(screen.queryByText("Bug One")).not.toBeInTheDocument();
  });

  it("clears the status filter down to an empty array when every option is unchecked", async () => {
    useBeansMock.mockReturnValue({ data: beans, isPending: false, isError: false });
    const user = userEvent.setup();

    renderProjectList();
    await screen.findByText("Milestone One");

    await user.click(screen.getByRole("button", { name: /^Status/ }));
    await user.click(screen.getByRole("checkbox", { name: "draft" }));
    await user.click(screen.getByRole("checkbox", { name: "todo" }));
    await user.click(screen.getByRole("checkbox", { name: "in-progress" }));

    expect(screen.getByRole("button", { name: /^Status/ })).toBeInTheDocument();
  });

  it("propagates priority and tag filter changes to the URL and back", async () => {
    useBeansMock.mockReturnValue({ data: beans, isPending: false, isError: false });
    const user = userEvent.setup();

    renderProjectList();
    await screen.findByText("Milestone One");

    await user.click(screen.getByRole("button", { name: /^Priority/ }));
    await user.click(screen.getByRole("checkbox", { name: "high" }));
    expect(screen.getByRole("button", { name: /^Priority \(1\)/ })).toBeInTheDocument();

    await user.type(screen.getByLabelText("Tags"), "urgent");
    expect(screen.getByLabelText("Tags")).toHaveValue("urgent");
  });

  it("defaults to ascending then toggles through descending and back to ascending", async () => {
    useBeansMock.mockReturnValue({ data: beans, isPending: false, isError: false });
    const user = userEvent.setup();

    renderProjectList("/p/testproj?sort=title");
    await screen.findByText("Milestone One");

    expect(screen.getByRole("button", { name: "Toggle sort direction" })).toHaveTextContent("↑");

    await user.click(screen.getByRole("button", { name: "Toggle sort direction" }));
    expect(screen.getByRole("button", { name: "Toggle sort direction" })).toHaveTextContent("↓");

    await user.click(screen.getByRole("button", { name: "Toggle sort direction" }));
    expect(screen.getByRole("button", { name: "Toggle sort direction" })).toHaveTextContent("↑");
  });

  it("shows an empty state in flat view when a search leaves no beans", async () => {
    useBeansMock.mockImplementation((_project: string, search: string) =>
      search === ""
        ? { data: beans, isPending: false, isError: false }
        : { data: [], isPending: false, isError: false },
    );
    const user = userEvent.setup();

    renderProjectList();
    await screen.findByText("Milestone One");
    await user.click(screen.getByRole("button", { name: "Flat" }));
    await user.type(screen.getByLabelText("Search beans"), "zzz");

    expect(await screen.findByText("No beans match the current filters.")).toBeInTheDocument();
  });

  it("shows an empty state in hierarchy view when a search leaves no beans", async () => {
    useBeansMock.mockImplementation((_project: string, search: string) =>
      search === ""
        ? { data: beans, isPending: false, isError: false }
        : { data: [], isPending: false, isError: false },
    );
    const user = userEvent.setup();

    renderProjectList();
    await screen.findByText("Milestone One");
    await user.type(screen.getByLabelText("Search beans"), "zzz");

    expect(await screen.findByText("No beans match the current filters.")).toBeInTheDocument();
  });
});

describe("validateProjectSearch", () => {
  it("returns an empty object for an empty search", () => {
    expect(validateProjectSearch({})).toEqual({});
  });

  it("coerces single string values into arrays and drops unknown values", () => {
    expect(validateProjectSearch({ type: "task", status: ["todo", "not-a-status"] })).toEqual({
      type: ["task"],
      status: ["todo"],
    });
  });

  it("passes tags through without filtering against a known list", () => {
    expect(validateProjectSearch({ tags: "urgent" })).toEqual({ tags: ["urgent"] });
    expect(validateProjectSearch({ tags: [] })).toEqual({});
  });

  it("keeps a non-empty search string and drops non-string or empty values", () => {
    expect(validateProjectSearch({ search: "login" })).toEqual({ search: "login" });
    expect(validateProjectSearch({ search: "" })).toEqual({});
    expect(validateProjectSearch({ search: 42 })).toEqual({});
  });

  it("ignores values that are neither strings nor arrays", () => {
    expect(validateProjectSearch({ type: 5, priority: null })).toEqual({});
  });

  it("keeps a non-empty priority filter", () => {
    expect(validateProjectSearch({ priority: "high" })).toEqual({ priority: ["high"] });
  });

  it("validates prefix search param as a string array", () => {
    expect(validateProjectSearch({ prefix: ["romn", "hhroot"] })).toEqual({
      prefix: ["romn", "hhroot"],
    });
    expect(validateProjectSearch({ prefix: "romn" })).toEqual({ prefix: ["romn"] });
  });

  it("accepts valid sort and dir values", () => {
    expect(validateProjectSearch({ sort: "title", dir: "desc" })).toEqual({
      sort: "title",
      dir: "desc",
    });
    expect(validateProjectSearch({ sort: "type" })).toEqual({ sort: "type" });
    expect(validateProjectSearch({ sort: "status" })).toEqual({ sort: "status" });
  });

  it("drops invalid sort and dir values", () => {
    expect(validateProjectSearch({ sort: "not-a-key", dir: "sideways" })).toEqual({});
    expect(validateProjectSearch({ sort: 5, dir: null })).toEqual({});
  });
});
