import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { BodyEditor } from "./BodyEditor.js";

describe("BodyEditor", () => {
  it("reports textarea edits via onChange", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<BodyEditor value="hello" onChange={onChange} />);

    await user.type(screen.getByLabelText("Body"), "!");

    expect(onChange).toHaveBeenCalledWith("hello!");
  });

  it("renders sanitized markdown when Preview is toggled, and back to Edit", async () => {
    const user = userEvent.setup();
    render(<BodyEditor value="**bold** <script>alert(1)</script>" onChange={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "Preview" }));

    expect(screen.getByTestId("body-editor-preview")).toHaveTextContent("bold");
    expect(screen.queryByLabelText("Body")).not.toBeInTheDocument();
    expect(document.querySelector("script")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Edit" }));

    expect(screen.getByLabelText("Body")).toBeInTheDocument();
  });
});
