import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { LinkedBeans } from "./LinkedBeans.js";

import { renderWithRouter } from "../test/renderWithRouter.js";

describe("LinkedBeans", () => {
  it("renders parent, children, blocks, and blocked-by groups", async () => {
    renderWithRouter(
      <LinkedBeans
        project="p"
        parent={{ id: "m1", title: "Milestone", type: "milestone", status: "todo" }}
        children={[{ id: "t1", title: "Task one", type: "task", status: "todo" }]}
        blocking={[{ id: "b1", title: "Blocked thing", type: "task", status: "todo" }]}
        blockedBy={[]}
      />,
    );
    expect(await screen.findByText("Parent")).toBeInTheDocument();
    expect(screen.getByText("Milestone")).toBeInTheDocument();
    expect(screen.getByText("Task one")).toBeInTheDocument();
    expect(screen.getByText("Blocks")).toBeInTheDocument();
    expect(screen.queryByText("Blocked by")).not.toBeInTheDocument(); // empty group omitted
  });

  it("omits all groups when there is no parent and every list is empty", async () => {
    const { container } = renderWithRouter(
      <LinkedBeans project="p" parent={null} children={[]} blocking={[]} blockedBy={[]} />,
    );
    await screen.findByTestId("linked-beans");
    expect(container.querySelector(".linked-beans")?.children.length).toBe(0);
  });

  it("links each item to its bean detail route", async () => {
    renderWithRouter(
      <LinkedBeans
        project="demo"
        parent={null}
        children={[{ id: "t1", title: "Task one", type: "task", status: "todo" }]}
        blocking={[]}
        blockedBy={[]}
      />,
    );
    const link = (await screen.findByText("Task one")).closest("a");
    expect(link).toHaveAttribute("href", "/p/demo/t1");
  });
});
