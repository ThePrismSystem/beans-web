import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { Overview } from "./overview.js";

import { renderWithRouter } from "../test/renderWithRouter.js";

import type { BeanType, Project } from "@beans-frontend/shared";

const { useProjectsMock } = vi.hoisted(() => ({ useProjectsMock: vi.fn() }));

vi.mock("../hooks/useProjects.js", () => ({ useProjects: useProjectsMock }));

const project: Project = {
  name: "handbellhub",
  path: "/g/handbellhub",
  root: "/g",
  prefix: "hh-",
  counts: {
    total: 10,
    open: 3,
    byType: { milestone: 1, epic: 2, feature: 0, task: 4, bug: 3 },
    byStatus: { draft: 0, todo: 0, "in-progress": 0, completed: 0, scrapped: 0 },
    openByType: { milestone: 0, epic: 0, feature: 0, task: 2, bug: 1 },
    error: false,
  },
};

describe("Overview", () => {
  it("renders a ledger row with open-by-type and open/total", async () => {
    useProjectsMock.mockReturnValue({ data: [project], isPending: false, isError: false });
    renderWithRouter(<Overview />);
    expect(await screen.findByText(project.name)).toBeInTheDocument();
    // open · total summary present
    expect(screen.getByText(/open/)).toBeInTheDocument();
    expect(screen.getByText(/total/)).toBeInTheDocument();
    // open-by-type entries with pipe separators, zero types omitted
    expect(screen.getByText(/task/)).toBeInTheDocument();
    expect(screen.getByText(/bug/)).toBeInTheDocument();
    expect(screen.queryByText(/milestone/)).not.toBeInTheDocument();
    expect(screen.getByText("|")).toBeInTheDocument();
  });

  it("renders the project name as a heading", async () => {
    useProjectsMock.mockReturnValue({ data: [project], isPending: false, isError: false });
    renderWithRouter(<Overview />);
    expect(
      await screen.findByRole("heading", { name: project.name, level: 2 }),
    ).toBeInTheDocument();
  });

  it("defaults a missing open-by-type count to zero instead of omitting the row", async () => {
    const sparseProject: Project = {
      ...project,
      name: "sparse-project",
      counts: { ...project.counts, openByType: { task: 2 } as Record<BeanType, number> },
    };
    useProjectsMock.mockReturnValue({ data: [sparseProject], isPending: false, isError: false });

    renderWithRouter(<Overview />);

    expect(await screen.findByText("sparse-project")).toBeInTheDocument();
    expect(screen.getByText(/task/)).toBeInTheDocument();
    // Only `task` (count 2) is open; every other type defaults to 0 and is
    // filtered out, so there is nothing to separate with a pipe.
    expect(screen.queryByText("|")).not.toBeInTheDocument();
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
