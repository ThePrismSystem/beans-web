import { describe, expect, it } from "vitest";

import { beanPrefix, distinctPrefixes } from "./prefix.js";

describe("beanPrefix", () => {
  it("takes everything before the final hyphen", () => {
    expect(beanPrefix("hhroot-o5e5")).toBe("hhroot");
    expect(beanPrefix("cc-web-ab12")).toBe("cc-web");
  });
  it("returns the whole id when there is no hyphen", () => {
    expect(beanPrefix("abc123")).toBe("abc123");
  });
});

describe("distinctPrefixes", () => {
  it("returns unique prefixes sorted", () => {
    expect(distinctPrefixes([{ id: "romn-1" }, { id: "hhroot-2" }, { id: "romn-3" }])).toEqual([
      "hhroot",
      "romn",
    ]);
  });
});
