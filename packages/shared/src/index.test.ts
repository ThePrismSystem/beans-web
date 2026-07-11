import { describe, expect, it } from "vitest";

import * as shared from "./index.js";

// The package's public entry point (`.` in package.json `exports`) is this
// re-export barrel; nothing else in this package imports through it, so it
// otherwise carries no test coverage of its own. Assert it actually
// re-exports one runtime value from each of the three source modules it
// aggregates (enums, hierarchy, types — the latter contributes no runtime
// exports, since it's type-only).
describe("shared package entry point", () => {
  it("re-exports enum constants", () => {
    expect(shared.BEAN_TYPES).toEqual(["milestone", "epic", "feature", "task", "bug"]);
  });

  it("re-exports hierarchy helpers", () => {
    expect(shared.canParent("task", "feature")).toBe(true);
    expect(shared.validParentTypes("milestone")).toBeNull();
  });
});
