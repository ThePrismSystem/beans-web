import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AppShell } from "./AppShell.js";

import type { Project, ServerEvent } from "@beans-frontend/shared";

const { useProjectsMock, useEventsMock } = vi.hoisted(() => ({
  useProjectsMock: vi.fn(),
  useEventsMock: vi.fn(),
}));

vi.mock("../hooks/useProjects.js", () => ({ useProjects: useProjectsMock }));
vi.mock("../hooks/useEvents.js", () => ({ useEvents: useEventsMock }));
vi.mock("../hooks/useSearch.js", () => ({
  useSearch: () => ({ data: undefined, isPending: false, isError: false }),
}));

const project: Project = {
  name: "handbellhub",
  prefix: "hh-",
  counts: {
    total: 10,
    open: 4,
    byType: { milestone: 0, epic: 0, feature: 0, task: 0, bug: 0 },
    byStatus: { draft: 0, todo: 0, "in-progress": 0, completed: 0, scrapped: 0 },
    openByType: { milestone: 0, epic: 0, feature: 0, task: 0, bug: 0 },
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

  it("opens and closes the project drawer from the header toggle", async () => {
    useProjectsMock.mockReturnValue({ data: [project], isPending: false, isError: false });
    const user = userEvent.setup();

    renderAppShell();

    const toggle = await screen.findByRole("button", { name: "Toggle project menu" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("button", { name: "Close menu" })).not.toBeInTheDocument();

    await user.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");

    await user.click(screen.getByRole("button", { name: "Close menu" }));
    expect(toggle).toHaveAttribute("aria-expanded", "false");
  });

  it("closes the drawer on Escape", async () => {
    useProjectsMock.mockReturnValue({ data: [project], isPending: false, isError: false });
    const user = userEvent.setup();

    renderAppShell();

    const toggle = await screen.findByRole("button", { name: "Toggle project menu" });
    await user.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");

    await user.keyboard("{Escape}");
    expect(toggle).toHaveAttribute("aria-expanded", "false");
  });

  it("does not render the updated indicator when no live-sync event has arrived", async () => {
    useProjectsMock.mockReturnValue({ data: [project], isPending: false, isError: false });

    renderAppShell();

    await screen.findByText("handbellhub");
    // Targets the pill by name, not by role: HeaderSearch also owns a
    // role="status" region (the search result count).
    expect(screen.queryByText("Updated")).not.toBeInTheDocument();
  });

  describe("with a live-sync event", () => {
    it("shows the updated indicator when an event arrives", async () => {
      useProjectsMock.mockReturnValue({ data: [project], isPending: false, isError: false });
      const event: ServerEvent = { project: "handbellhub", kind: "change" };
      useEventsMock.mockReturnValue({ lastEvent: event });

      renderAppShell();

      expect(await screen.findByText("Updated")).toBeInTheDocument();
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

        expect(screen.getByText("Updated")).toBeInTheDocument();

        await act(async () => {
          await vi.advanceTimersByTimeAsync(2000);
        });

        expect(screen.queryByText("Updated")).not.toBeInTheDocument();
      } finally {
        vi.useRealTimers();
      }
    });
  });

  it("exposes a skip link to the main landmark", async () => {
    useProjectsMock.mockReturnValue({ data: [project], isPending: false, isError: false });

    renderAppShell();

    const skip = await screen.findByRole("link", { name: "Skip to content" });
    expect(skip).toHaveAttribute("href", "#main-content");
    expect(document.querySelector("#main-content")).toBe(screen.getByRole("main"));
  });

  it("leaves both regions interactive on a desktop viewport", async () => {
    useProjectsMock.mockReturnValue({ data: [project], isPending: false, isError: false });

    renderAppShell();
    await screen.findByText("handbellhub");

    expect(screen.getByRole("navigation", { name: "Projects" })).not.toHaveAttribute("inert");
    expect(document.querySelector(".app-main")).not.toHaveAttribute("inert");
  });

  describe("at drawer widths", () => {
    beforeEach(() => {
      // test-setup reports "no match" so components take their desktop branch;
      // this flips the drawer breakpoint on for these cases only.
      vi.stubGlobal("matchMedia", (query: string) => ({
        matches: true,
        media: query,
        onchange: null,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
        dispatchEvent: () => false,
      }));
    });

    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it("takes the closed drawer out of the tab order", async () => {
      useProjectsMock.mockReturnValue({ data: [project], isPending: false, isError: false });

      renderAppShell();
      await screen.findByText("handbellhub");

      // Closed, the drawer is only moved off-screen by a transform, so without
      // `inert` its links stay focusable while invisible.
      expect(screen.getByRole("navigation", { name: "Projects" })).toHaveAttribute("inert");
      expect(document.querySelector(".app-main")).not.toHaveAttribute("inert");
    });

    it("makes the drawer interactive and the page behind it inert when opened", async () => {
      useProjectsMock.mockReturnValue({ data: [project], isPending: false, isError: false });
      const user = userEvent.setup();

      renderAppShell();
      await user.click(await screen.findByRole("button", { name: "Toggle project menu" }));

      expect(screen.getByRole("navigation", { name: "Projects" })).not.toHaveAttribute("inert");
      expect(document.querySelector(".app-main")).toHaveAttribute("inert");
    });

    it("moves focus into the drawer on open and back to the hamburger on close", async () => {
      useProjectsMock.mockReturnValue({ data: [project], isPending: false, isError: false });
      const user = userEvent.setup();

      renderAppShell();
      const toggle = await screen.findByRole("button", { name: "Toggle project menu" });

      await user.click(toggle);
      expect(screen.getByRole("link", { name: "Overview" })).toHaveFocus();

      await user.keyboard("{Escape}");
      expect(toggle).toHaveFocus();
    });
  });
});
