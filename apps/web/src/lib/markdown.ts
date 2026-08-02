import DOMPurify from "dompurify";
import { marked } from "marked";

const MAX_HEADING_LEVEL = 6;

marked.setOptions({ gfm: true, breaks: true });

/**
 * Bean bodies are authored by people and by coding agents, so their headings
 * start wherever the author felt like starting. Rendered as-is, a body opening
 * with `#` puts a second `<h1>` on a page whose `<h1>` is already the bean's
 * title, and a body opening with `###` skips a level. Demoting every heading by
 * one keeps the body nested under the title and the outline continuous
 * (WCAG 1.3.1). `######` has nowhere to go, so it stays put.
 */
marked.use({
  walkTokens: (token) => {
    if (token.type === "heading") {
      token.depth = Math.min(token.depth + 1, MAX_HEADING_LEVEL);
    }
  },
});

/**
 * Bodies can link anywhere. Sending an external link to a new tab keeps the
 * app — and any half-finished edit in it — from being navigated away, and
 * `noopener noreferrer` denies the opened page a handle back. The visually
 * hidden note is what tells a screen reader user the tab is about to change
 * (WCAG 3.2.5), since nothing else about the link says so.
 */
DOMPurify.addHook("afterSanitizeAttributes", (node) => {
  if (!(node instanceof HTMLAnchorElement)) {
    return;
  }
  const href = node.getAttribute("href") ?? "";
  if (!/^https?:\/\//i.test(href)) {
    return;
  }
  node.setAttribute("target", "_blank");
  node.setAttribute("rel", "noopener noreferrer");
  const note = node.ownerDocument.createElement("span");
  note.className = "visually-hidden";
  note.textContent = " (opens in a new tab)";
  node.append(note);
});

/**
 * Renders a bean's markdown body to sanitized HTML, safe to pass to
 * `dangerouslySetInnerHTML`. Keeps the markdown -> HTML -> sanitize pipeline
 * isolated so it can be swapped out or unit tested independently of any
 * component.
 */
export function renderMarkdown(source: string): string {
  const html = marked.parse(source, { async: false });
  return DOMPurify.sanitize(html, { ADD_ATTR: ["target"] });
}
