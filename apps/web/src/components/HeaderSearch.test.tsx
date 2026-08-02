import { fireEvent, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { HeaderSearch } from "./HeaderSearch.js";
import { renderWithRouter } from "../test/renderWithRouter.js";

const { useSearchMock } = vi.hoisted(() => ({ useSearchMock: vi.fn() }));
vi.mock("../hooks/useSearch.js", () => ({ useSearch: useSearchMock }));

const hits = [
  {
    project: "hh",
    bean: { id: "hh-1", title: "Ring bell", type: "task", status: "todo", priority: "normal" },
  },
];

describe("HeaderSearch", () => {
  it("shows matching beans in a dropdown as you type", async () => {
    useSearchMock.mockReturnValue({
      data: { hits, failures: [] },
      isPending: false,
      isError: false,
    });
    const user = userEvent.setup();
    renderWithRouter(<HeaderSearch />);
    const search = await screen.findByRole("search", { name: "Global search" });
    await user.type(search.querySelector("input")!, "bell");
    expect(await screen.findByText("Ring bell")).toBeInTheDocument();
  });

  it("navigates to the search page and closes the dropdown on Enter", async () => {
    useSearchMock.mockReturnValue({
      data: { hits, failures: [] },
      isPending: false,
      isError: false,
    });
    const user = userEvent.setup();
    const { router } = renderWithRouter(<HeaderSearch />);
    const search = await screen.findByRole("search", { name: "Global search" });
    const input = search.querySelector("input")!;
    await user.type(input, "bell");
    await screen.findByText("Ring bell");

    await user.keyboard("{Enter}");

    expect(screen.queryByText("Ring bell")).not.toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/search");
    expect(router.state.location.search).toEqual({ q: "bell" });
  });

  it("closes the dropdown on Escape", async () => {
    useSearchMock.mockReturnValue({
      data: { hits, failures: [] },
      isPending: false,
      isError: false,
    });
    const user = userEvent.setup();
    renderWithRouter(<HeaderSearch />);
    const search = await screen.findByRole("search", { name: "Global search" });
    const input = search.querySelector("input")!;
    await user.type(input, "bell");
    await screen.findByText("Ring bell");

    await user.keyboard("{Escape}");

    expect(screen.queryByText("Ring bell")).not.toBeInTheDocument();
  });

  it("closes the dropdown on outside click", async () => {
    useSearchMock.mockReturnValue({
      data: { hits, failures: [] },
      isPending: false,
      isError: false,
    });
    const user = userEvent.setup();
    renderWithRouter(<HeaderSearch />);
    const search = await screen.findByRole("search", { name: "Global search" });
    await user.type(search.querySelector("input")!, "bell");
    await screen.findByText("Ring bell");

    fireEvent.mouseDown(document.body);

    expect(screen.queryByText("Ring bell")).not.toBeInTheDocument();
  });

  it("closes the dropdown when a hit is clicked", async () => {
    useSearchMock.mockReturnValue({
      data: { hits, failures: [] },
      isPending: false,
      isError: false,
    });
    const user = userEvent.setup();
    renderWithRouter(<HeaderSearch />);
    const search = await screen.findByRole("search", { name: "Global search" });
    await user.type(search.querySelector("input")!, "bell");

    await user.click(await screen.findByText("Ring bell"));

    expect(screen.queryByText("Ring bell")).not.toBeInTheDocument();
  });

  describe("combobox keyboard support", () => {
    const manyHits = [
      { project: "hh", bean: { id: "hh-1", title: "Ring bell", type: "task", status: "todo" } },
      { project: "hh", bean: { id: "hh-2", title: "Tune bell", type: "bug", status: "todo" } },
      { project: "hh", bean: { id: "hh-3", title: "Cast bell", type: "task", status: "draft" } },
    ];

    async function openDropdown() {
      useSearchMock.mockReturnValue({
        data: { hits: manyHits, failures: [] },
        isPending: false,
        isError: false,
      });
      const user = userEvent.setup();
      const rendered = renderWithRouter(<HeaderSearch />);
      const search = await screen.findByRole("search", { name: "Global search" });
      const input = search.querySelector("input")!;
      await user.type(input, "bell");
      await screen.findByText("Ring bell");
      return { user, input, ...rendered };
    }

    it("exposes the input as a combobox wired to the listbox", async () => {
      const { input } = await openDropdown();

      expect(input).toHaveAttribute("role", "combobox");
      expect(input).toHaveAttribute("aria-expanded", "true");
      expect(input).toHaveAttribute("aria-controls", screen.getByRole("listbox").id);
    });

    it("moves the active option down and points aria-activedescendant at it", async () => {
      const { user, input } = await openDropdown();

      await user.keyboard("{ArrowDown}");

      const options = screen.getAllByRole("option");
      expect(options[0]).toHaveAttribute("aria-selected", "true");
      expect(input).toHaveAttribute("aria-activedescendant", options[0]!.id);

      await user.keyboard("{ArrowDown}");
      expect(screen.getAllByRole("option")[1]).toHaveAttribute("aria-selected", "true");
    });

    it("wraps from the last option back to the first", async () => {
      const { user } = await openDropdown();

      await user.keyboard("{ArrowUp}");

      // ArrowUp from nothing selected lands on the final option.
      expect(screen.getAllByRole("option")[2]).toHaveAttribute("aria-selected", "true");

      await user.keyboard("{ArrowDown}");
      expect(screen.getAllByRole("option")[0]).toHaveAttribute("aria-selected", "true");
    });

    it("jumps to the first and last options with Home and End", async () => {
      const { user } = await openDropdown();

      await user.keyboard("{End}");
      expect(screen.getAllByRole("option")[2]).toHaveAttribute("aria-selected", "true");

      await user.keyboard("{Home}");
      expect(screen.getAllByRole("option")[0]).toHaveAttribute("aria-selected", "true");
    });

    it("opens the highlighted bean on Enter instead of running a full search", async () => {
      const { user, router } = await openDropdown();

      await user.keyboard("{ArrowDown}{ArrowDown}{Enter}");

      expect(router.state.location.pathname).toBe("/p/hh/hh-2");
    });

    it("clears the highlight when the query changes", async () => {
      const { user, input } = await openDropdown();
      await user.keyboard("{ArrowDown}");
      expect(input).toHaveAttribute("aria-activedescendant");

      await user.type(input, "s");

      expect(input).not.toHaveAttribute("aria-activedescendant");
    });

    it("announces the result count in a live region", async () => {
      await openDropdown();

      expect(screen.getByRole("status")).toHaveTextContent("3 results");
    });
  });
});
