import { describe, expect, it } from "vitest";

import { parseEnumValue } from "./enum.js";

const COLORS = ["red", "green", "blue"] as const;

describe("parseEnumValue", () => {
  it("returns the value when it is a member of options", () => {
    expect(parseEnumValue("green", COLORS)).toBe("green");
  });

  it("returns undefined when the value is not a member of options", () => {
    expect(parseEnumValue("purple", COLORS)).toBeUndefined();
  });

  it("returns undefined for an empty string", () => {
    expect(parseEnumValue("", COLORS)).toBeUndefined();
  });
});
