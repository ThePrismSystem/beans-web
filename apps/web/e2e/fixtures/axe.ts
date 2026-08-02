import AxeBuilder from "@axe-core/playwright";

import type { Page } from "@playwright/test";

const WCAG = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

// `heading-order` and the landmark rules ship under axe's best-practice tag
// rather than a WCAG one, so a tag-only scan misses a document that starts at
// <h2> or skips a level. They are cheap and unambiguous, so they run alongside.
const BEST_PRACTICE_RULES = ["heading-order", "landmark-unique", "page-has-heading-one"];

/** Runs axe over the current page at WCAG 2.1 A/AA plus the rules above. */
export async function scan(page: Page) {
  return new AxeBuilder({ page }).withTags(WCAG).withRules(BEST_PRACTICE_RULES).analyze();
}
