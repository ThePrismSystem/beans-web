import { describe, expect, it } from "vitest";

import { canParent, validParentTypes } from "./hierarchy.js";

describe("validParentTypes", () => {
  it("returns null for milestone (no parent allowed)", () => {
    expect(validParentTypes("milestone")).toBeNull();
  });
  it("allows only milestone for epic", () => {
    expect(validParentTypes("epic")).toEqual(["milestone"]);
  });
  it("allows milestone and epic for feature", () => {
    expect(validParentTypes("feature")).toEqual(["milestone", "epic"]);
  });
  it("allows milestone, epic, feature for task and bug", () => {
    expect(validParentTypes("task")).toEqual(["milestone", "epic", "feature"]);
    expect(validParentTypes("bug")).toEqual(["milestone", "epic", "feature"]);
  });
});

describe("canParent", () => {
  it("rejects any parent for a milestone child", () => {
    expect(canParent("milestone", "milestone")).toBe(false);
  });
  it("accepts milestone as parent of epic", () => {
    expect(canParent("epic", "milestone")).toBe(true);
  });
  it("rejects epic as parent of epic", () => {
    expect(canParent("epic", "epic")).toBe(false);
  });
  it("accepts feature as parent of task", () => {
    expect(canParent("task", "feature")).toBe(true);
  });
});
