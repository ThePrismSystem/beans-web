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
