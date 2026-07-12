import { act, render, screen } from "@testing-library/react";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AppShell } from "./AppShell.js";

import type { Project, ServerEvent } from "@beans-frontend/shared";

const { useProjectsMock, useEventsMock } = vi.hoisted(() => ({
  useProjectsMock: vi.fn(),
  useEventsMock: vi.fn(),
}));

vi.mock("../hooks/useProjects.js", () => ({ useProjects: useProjectsMock }));
vi.mock("../hooks/useEvents.js", () => ({ useEvents: useEventsMock }));

const project: Project = {
  name: "handbellhub",
  path: "/g/handbellhub",
  prefix: "hh-",
  counts: {
    total: 10,
    open: 4,
    byType: { milestone: 0, epic: 0, feature: 0, task: 0, bug: 0 },
    byStatus: { draft: 0, todo: 0, "in-progress": 0, completed: 0, scrapped: 0 },
    error: false,
  },
};

function renderAppShell() {
  const rootRoute = createRootRoute({ component: AppShell });
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/",
    component: () => <div>outlet content</div>,
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([indexRoute]),
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });

  return render(<RouterProvider router={router} />);
}

describe("AppShell", () => {
  beforeEach(() => {
    useEventsMock.mockReturnValue({ lastEvent: null });
  });

  it("renders the sidebar with projects, a search entry, and the routed outlet", async () => {
    useProjectsMock.mockReturnValue({ data: [project], isPending: false, isError: false });

    renderAppShell();

    expect(await screen.findByText("handbellhub")).toBeInTheDocument();
    expect(screen.getByText("outlet content")).toBeInTheDocument();
    expect(screen.getByRole("search", { name: "Global search" })).toBeInTheDocument();
  });

  it("renders an empty sidebar while projects are still loading", async () => {
    useProjectsMock.mockReturnValue({ data: undefined, isPending: true, isError: false });

    renderAppShell();

    expect(await screen.findByText("Overview")).toBeInTheDocument();
    expect(screen.queryByText("handbellhub")).not.toBeInTheDocument();
  });

  it("does not render the updated indicator when no live-sync event has arrived", async () => {
    useProjectsMock.mockReturnValue({ data: [project], isPending: false, isError: false });

    renderAppShell();

    await screen.findByText("handbellhub");
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  describe("with a live-sync event", () => {
    it("shows the updated indicator when an event arrives", async () => {
      useProjectsMock.mockReturnValue({ data: [project], isPending: false, isError: false });
      const event: ServerEvent = { project: "handbellhub", kind: "change" };
      useEventsMock.mockReturnValue({ lastEvent: event });

      renderAppShell();

      expect(await screen.findByRole("status")).toHaveTextContent("Updated");
    });

    it("fades the updated indicator out after a delay", async () => {
      vi.useFakeTimers();
      try {
        useProjectsMock.mockReturnValue({ data: [project], isPending: false, isError: false });
        const event: ServerEvent = { project: "handbellhub", kind: "change" };
        useEventsMock.mockReturnValue({ lastEvent: event });

        renderAppShell();
        await act(async () => {
          await vi.advanceTimersByTimeAsync(0);
        });

        expect(screen.getByRole("status")).toHaveTextContent("Updated");

        await act(async () => {
          await vi.advanceTimersByTimeAsync(2000);
        });

        expect(screen.queryByRole("status")).not.toBeInTheDocument();
      } finally {
        vi.useRealTimers();
      }
    });
  });
});
