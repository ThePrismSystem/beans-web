import { describe, expect, it } from "vitest";

import { zeroCounts } from "./counts.js";
import { BEAN_STATUSES, BEAN_TYPES } from "./enums.js";

describe("zeroCounts", () => {
  it("builds a record with every key set to zero", () => {
    expect(zeroCounts(BEAN_TYPES)).toEqual({
      milestone: 0,
      epic: 0,
      feature: 0,
      task: 0,
      bug: 0,
    });
  });

  it("covers all status keys", () => {
    const counts = zeroCounts(BEAN_STATUSES);
    expect(Object.keys(counts).sort()).toEqual([...BEAN_STATUSES].sort());
    expect(Object.values(counts).every((v) => v === 0)).toBe(true);
  });

  it("returns an empty record for no keys", () => {
    expect(zeroCounts([])).toEqual({});
  });
});
