import { describe, expect, it } from "vitest";

import { renderMarkdown } from "./markdown.js";

describe("renderMarkdown", () => {
  it("renders markdown syntax to HTML", () => {
    const html = renderMarkdown("**bold** and _italic_");
    expect(html).toContain("<strong>bold</strong>");
    expect(html).toContain("<em>italic</em>");
  });

  it("sanitizes raw script tags out of the body", () => {
    const html = renderMarkdown('<script>alert("xss")</script>Hello');
    expect(html).not.toContain("<script>");
    expect(html).toContain("Hello");
  });

  it("strips inline event handler attributes", () => {
    const html = renderMarkdown('<img src="x" onerror="alert(1)">');
    expect(html).not.toContain("onerror");
  });
});
