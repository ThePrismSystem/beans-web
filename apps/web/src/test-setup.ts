import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

import "@testing-library/jest-dom/vitest";

// vitest.config.ts runs with globals: false, so Testing Library's automatic
// cleanup (which hooks the global afterEach) never registers on its own.
afterEach(() => {
  cleanup();
});

// jsdom doesn't implement scrollTo; TanStack Router's scroll restoration
// calls it on every navigation/mount.
window.scrollTo = () => {
  // no-op in jsdom
};

// jsdom doesn't implement matchMedia. useMediaQuery reads it on first render,
// so it has to exist before any component mounts. Reports "no match", which
// puts components on their desktop branch — the mobile branch is covered by
// the Playwright suite, which runs in a real engine at a real viewport.
window.matchMedia = (query: string): MediaQueryList => ({
  matches: false,
  media: query,
  onchange: null,
  addEventListener: () => {},
  removeEventListener: () => {},
  addListener: () => {},
  removeListener: () => {},
  dispatchEvent: () => false,
});
