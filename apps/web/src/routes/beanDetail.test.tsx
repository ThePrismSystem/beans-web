import { render, screen } from "@testing-library/react";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { afterEach, describe, expect, it, vi } from "vitest";

import { BeanDetailPage } from "./beanDetail.js";

import type { BeanDetail } from "../hooks/useBean.js";

const { useBeanMock } = vi.hoisted(() => ({ useBeanMock: vi.fn() }));

vi.mock("../hooks/useBean.js", () => ({ useBean: useBeanMock }));

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

function renderBeanDetail(initialLocation = "/p/demo/t1") {
  const rootRoute = createRootRoute();
  const beanRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/p/$project/$beanId",
    component: BeanDetailPage,
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([beanRoute]),
    history: createMemoryHistory({ initialEntries: [initialLocation] }),
  });
  return render(<RouterProvider router={router} />);
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("BeanDetailPage", () => {
  it("renders the title, sanitized body, and a linked child", async () => {
    useBeanMock.mockReturnValue({ data: bean, isPending: false, isError: false });

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
});
