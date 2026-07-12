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
});
