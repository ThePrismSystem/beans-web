import { cleanup, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { StatusDot } from "./StatusDot.js";

import type { BeanStatus } from "@beans-web/shared";

describe("StatusDot", () => {
  it("renders the label for each status", () => {
    render(<StatusDot status="in-progress" />);
    expect(screen.getByText("In progress")).toBeInTheDocument();
  });

  it("renders a distinct label per status", () => {
    const cases: { status: BeanStatus; label: string }[] = [
      { status: "draft", label: "Draft" },
      { status: "todo", label: "To do" },
      { status: "completed", label: "Completed" },
      { status: "scrapped", label: "Scrapped" },
    ];

    for (const { status, label } of cases) {
      cleanup();
      render(<StatusDot status={status} />);
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });
});
