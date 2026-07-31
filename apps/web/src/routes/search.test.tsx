import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { SearchPage, validateSearchPageSearch } from "./search.js";

import { renderWithRouter } from "../test/renderWithRouter.js";

import type { SearchHit } from "@beans-frontend/shared";

const { useSearchMock } = vi.hoisted(() => ({ useSearchMock: vi.fn() }));

vi.mock("../hooks/useSearch.js", () => ({ useSearch: useSearchMock }));

const hit: SearchHit = {
  project: "handbellhub",
  bean: { id: "hh-1", title: "Ring the bell", type: "task", status: "todo", priority: "normal" },
};

describe("SearchPage", () => {
  it("prompts the user to type before searching", async () => {
    useSearchMock.mockReturnValue({ data: undefined, isPending: false, isError: false });

    renderWithRouter(<SearchPage />);

    expect(
      await screen.findByText("Type to search beans across all projects."),
    ).toBeInTheDocument();
  });

  it("shows matching results once a query is entered", async () => {
    useSearchMock.mockReturnValue({
      data: { hits: [hit], failures: [] },
      isPending: false,
      isError: false,
    });
    const user = userEvent.setup();

    renderWithRouter(<SearchPage />);
    await user.type(await screen.findByLabelText("Search beans"), "bell");

    expect(await screen.findByText("Ring the bell")).toBeInTheDocument();
    expect(screen.getByText("handbellhub")).toBeInTheDocument();
  });

  it("shows a loading state while searching", async () => {
    useSearchMock.mockReturnValue({ data: undefined, isPending: true, isError: false });
    const user = userEvent.setup();

    renderWithRouter(<SearchPage />);
    await user.type(await screen.findByLabelText("Search beans"), "bell");

    expect(await screen.findByText("Searching…")).toBeInTheDocument();
  });

  it("shows an error message when the search fails", async () => {
    useSearchMock.mockReturnValue({ data: undefined, isPending: false, isError: true });
    const user = userEvent.setup();

    renderWithRouter(<SearchPage />);
    await user.type(await screen.findByLabelText("Search beans"), "bell");

    expect(await screen.findByText("Search failed.")).toBeInTheDocument();
  });

  it("shows an empty state when no beans match", async () => {
    useSearchMock.mockReturnValue({
      data: { hits: [], failures: [] },
      isPending: false,
      isError: false,
    });
    const user = userEvent.setup();

    renderWithRouter(<SearchPage />);
    await user.type(await screen.findByLabelText("Search beans"), "zzz");

    expect(await screen.findByText('No beans match "zzz".')).toBeInTheDocument();
  });

  it("syncs the input when the ?q= route param changes while mounted", async () => {
    useSearchMock.mockReturnValue({
      data: { hits: [hit], failures: [] },
      isPending: false,
      isError: false,
    });

    const { router } = renderWithRouter(<SearchPage />);
    expect(await screen.findByLabelText("Search beans")).toHaveValue("");

    await router.navigate({ to: "/", search: { q: "bell" } });

    expect(await screen.findByLabelText("Search beans")).toHaveValue("bell");
  });

  it("warns when some projects failed to search", async () => {
    useSearchMock.mockReturnValue({
      data: { hits: [hit], failures: ["beans"] },
      isPending: false,
      isError: false,
    });
    const user = userEvent.setup();

    renderWithRouter(<SearchPage />);
    await user.type(await screen.findByLabelText("Search beans"), "bell");

    expect(await screen.findByText(/Some projects failed to search: beans/)).toBeInTheDocument();
  });
});

describe("validateSearchPageSearch", () => {
  it("keeps a string q value", () => {
    expect(validateSearchPageSearch({ q: "chocolate" })).toEqual({ q: "chocolate" });
  });

  it("defaults non-string or missing q to an empty string", () => {
    expect(validateSearchPageSearch({ q: 123 })).toEqual({ q: "" });
    expect(validateSearchPageSearch({})).toEqual({ q: "" });
  });
});
