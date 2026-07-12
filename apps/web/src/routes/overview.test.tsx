import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { Overview } from "./overview.js";

import { renderWithRouter } from "../test/renderWithRouter.js";

import type { Project } from "@beans-frontend/shared";

const { useProjectsMock } = vi.hoisted(() => ({ useProjectsMock: vi.fn() }));

vi.mock("../hooks/useProjects.js", () => ({ useProjects: useProjectsMock }));

const project: Project = {
  name: "handbellhub",
  path: "/g/handbellhub",
  prefix: "hh-",
  counts: {
    total: 10,
    open: 4,
    byType: { milestone: 1, epic: 2, feature: 0, task: 1, bug: 0 },
    byStatus: { draft: 0, todo: 0, "in-progress": 0, completed: 0, scrapped: 0 },
    openByType: { milestone: 0, epic: 0, feature: 0, task: 0, bug: 0 },
    error: false,
  },
};

describe("Overview", () => {
  it("renders a project card with its open/total counts", async () => {
    useProjectsMock.mockReturnValue({
      data: [project],
      isPending: false,
      isError: false,
    });

    renderWithRouter(<Overview />);

    expect(await screen.findByText("handbellhub")).toBeInTheDocument();
    expect(screen.getByText("4 open / 10 total")).toBeInTheDocument();
  });

  it("shows a loading message while pending", async () => {
    useProjectsMock.mockReturnValue({ data: undefined, isPending: true, isError: false });

    renderWithRouter(<Overview />);

    expect(await screen.findByText("Loading projects…")).toBeInTheDocument();
  });

  it("shows an error message when the query fails", async () => {
    useProjectsMock.mockReturnValue({ data: undefined, isPending: false, isError: true });

    renderWithRouter(<Overview />);

    expect(await screen.findByText("Failed to load projects.")).toBeInTheDocument();
  });

  it("shows an empty state when there are no projects", async () => {
    useProjectsMock.mockReturnValue({ data: [], isPending: false, isError: false });

    renderWithRouter(<Overview />);

    expect(await screen.findByText("No projects found.")).toBeInTheDocument();
  });
});
