import { describe, expectTypeOf, it } from "vitest";

import type { Bean, BeanListItem } from "./types.js";

// These assertions are checked by `tsc`, not at runtime — a regression in the
// split fails `pnpm typecheck` as well as `vitest --typecheck`.
describe("bean types", () => {
  it("BeanListItem carries no body", () => {
    expectTypeOf<BeanListItem>().not.toHaveProperty("body");
  });

  it("Bean carries a string body", () => {
    expectTypeOf<Bean>().toHaveProperty("body");
    expectTypeOf<Bean["body"]>().toEqualTypeOf<string>();
  });

  it("Bean satisfies BeanListItem", () => {
    const bean = {} as Bean;
    const listItem: BeanListItem = bean;
    expectTypeOf(listItem).toHaveProperty("id");
  });
});
