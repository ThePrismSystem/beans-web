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

  describe("heading levels", () => {
    // The page's own <h1> is the bean title, so a body heading must never
    // reach h1 or the document ends up with two.
    it("demotes a top-level body heading to h2", () => {
      const html = renderMarkdown("# Body title");

      expect(html).toContain("<h2>Body title</h2>");
      expect(html).not.toContain("<h1");
    });

    it("demotes every level, keeping the body outline's shape", () => {
      const html = renderMarkdown("## Summary\n\n### Detail");

      expect(html).toContain("<h3>Summary</h3>");
      expect(html).toContain("<h4>Detail</h4>");
    });

    it("clamps at h6 rather than emitting an invalid h7", () => {
      const html = renderMarkdown("###### Deepest");

      expect(html).toContain("<h6>Deepest</h6>");
      expect(html).not.toContain("<h7");
    });
  });

  describe("links", () => {
    it("sends external links to a new tab and severs the opener", () => {
      const html = renderMarkdown("[docs](https://example.com)");

      expect(html).toContain('target="_blank"');
      expect(html).toContain('rel="noopener noreferrer"');
    });

    it("says the tab will change, for readers that cannot see the icon", () => {
      const html = renderMarkdown("[docs](https://example.com)");

      expect(html).toContain("opens in a new tab");
    });

    it("leaves relative links alone", () => {
      const html = renderMarkdown("[a bean](/p/demo/bf-1)");

      expect(html).not.toContain("target=");
      expect(html).not.toContain("opens in a new tab");
    });

    it("does not treat a javascript: url as external", () => {
      const html = renderMarkdown("[bad](javascript:alert(1))");

      expect(html).not.toContain("target=");
      expect(html).not.toContain("javascript:");
    });
  });
});
