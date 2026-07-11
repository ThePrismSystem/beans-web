import DOMPurify from "dompurify";
import { marked } from "marked";

marked.setOptions({ gfm: true, breaks: true });

/**
 * Renders a bean's markdown body to sanitized HTML, safe to pass to
 * `dangerouslySetInnerHTML`. Keeps the markdown -> HTML -> sanitize pipeline
 * isolated so it can be swapped out or unit tested independently of any
 * component.
 */
export function renderMarkdown(source: string): string {
  const html = marked.parse(source, { async: false });
  return DOMPurify.sanitize(html);
}
