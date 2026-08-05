import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { renderWithRouter } from "../test/renderWithRouter.js";

import { Sidebar } from "./Sidebar.js";

import type { Project } from "@beans-web/shared";

const projects: Project[] = [
  {
    name: "handbellhub",
    prefix: "hh-",
    counts: {
      total: 10,
      open: 4,
      byType: {
        milestone: 0,
        epic: 0,
        feature: 0,
        task: 0,
        bug: 0,
      },
      byStatus: {
        draft: 0,
        todo: 0,
        "in-progress": 0,
        completed: 0,
        scrapped: 0,
      },
      openByType: { milestone: 0, epic: 0, feature: 0, task: 0, bug: 0 },
      error: false,
    },
  },
];

describe("Sidebar", () => {
  it("renders Overview, Analytics, and each project with its open count", async () => {
    renderWithRouter(<Sidebar projects={projects} activeProject={undefined} />);
    expect(await screen.findByText("Overview")).toBeInTheDocument();
    expect(screen.getByText("Analytics")).toBeInTheDocument();
    expect(screen.getByText("handbellhub")).toBeInTheDocument();
    expect(screen.getByText("4")).toBeInTheDocument();
  });

  it("navigates to a project when its link is clicked", async () => {
    const user = userEvent.setup();
    const { router } = renderWithRouter(<Sidebar projects={projects} activeProject={undefined} />);
    await screen.findByText("handbellhub");

    await user.click(screen.getByText("handbellhub"));

    expect(router.state.location.pathname).toBe("/p/handbellhub");
  });

  it("marks the active project's link", async () => {
    renderWithRouter(<Sidebar projects={projects} activeProject="handbellhub" />);

    expect(await screen.findByText("handbellhub")).toBeInTheDocument();
    expect(screen.getByText("handbellhub").closest("a")).toHaveClass("active");
  });
});
