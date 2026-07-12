import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ProjectList, validateProjectSearch } from "./projectList.js";

import type { Bean } from "@beans-frontend/shared";

const { useBeansMock } = vi.hoisted(() => ({ useBeansMock: vi.fn() }));

vi.mock("../hooks/useBeans.js", async () => {
  const actual =
    await vi.importActual<typeof import("../hooks/useBeans.js")>("../hooks/useBeans.js");
  return { ...actual, useBeans: useBeansMock };
});

const milestone: Bean = {
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
  body: "",
  etag: "",
  parentId: null,
  blockingIds: [],
  blockedByIds: [],
};

const epic: Bean = {
  ...milestone,
  id: "e1",
  title: "Epic One",
  type: "epic",
  parentId: "m1",
};

const task: Bean = {
  ...milestone,
  id: "t1",
  title: "Task One",
  type: "task",
  parentId: "e1",
};

const bug: Bean = {
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
  return render(<RouterProvider router={router} />);
}

beforeEach(() => {
  window.localStorage.clear();
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

  it("updates the URL search params when a filter changes", async () => {
    useBeansMock.mockReturnValue({ data: beans, isPending: false, isError: false });
    const user = userEvent.setup();

    renderProjectList();
    await screen.findByText("Milestone One");

    await user.click(screen.getByRole("button", { name: "Flat" }));
    await user.click(screen.getByRole("button", { name: /^Type/ }));
    await user.click(screen.getByRole("checkbox", { name: "task" }));

    await waitFor(() => {
      expect(useBeansMock.mock.calls.at(-1)?.[1]).toMatchObject({ type: ["task"] });
    });

    await user.click(screen.getByRole("checkbox", { name: "task" }));

    await waitFor(() => {
      expect(useBeansMock.mock.calls.at(-1)?.[1]).toMatchObject({ type: [] });
    });
  });

  it("sends the type filter to the server in flat view", async () => {
    useBeansMock.mockReturnValue({ data: beans, isPending: false, isError: false });
    const user = userEvent.setup();

    renderProjectList();
    await screen.findByText("Milestone One");
    await user.click(screen.getByRole("button", { name: "Flat" }));

    await user.click(screen.getByRole("button", { name: /^Type/ }));
    await user.click(screen.getByRole("checkbox", { name: "task" }));

    await waitFor(() => {
      expect(useBeansMock.mock.calls.at(-1)?.[1]).toMatchObject({ type: ["task"] });
    });
  });

  it("keeps ancestor sections visible and does not forward the type filter to the server in hierarchy view", async () => {
    useBeansMock.mockReturnValue({ data: beans, isPending: false, isError: false });
    const user = userEvent.setup();

    renderProjectList();
    await screen.findByText("Milestone One");

    await user.click(screen.getByRole("button", { name: /^Type/ }));
    await user.click(screen.getByRole("checkbox", { name: "task" }));

    await waitFor(() => {
      expect(useBeansMock.mock.calls.at(-1)?.[1]).toMatchObject({ type: [] });
    });
    expect(screen.getByText("Milestone One")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Expand Milestone One" }));
    await user.click(screen.getByRole("button", { name: "Expand Epic One" }));

    expect(screen.getByText("Task One")).toBeInTheDocument();
    expect(screen.queryByText("Bug One")).not.toBeInTheDocument();
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
    const cherryRoot: Bean = { ...milestone, id: "cherry", title: "Cherry", type: "task" };
    const appleRoot: Bean = { ...milestone, id: "apple", title: "Apple", type: "task" };
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
