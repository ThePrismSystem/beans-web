import { describe, expect, it } from "vitest";

import { BEAN_PRIORITIES, BEAN_STATUSES, BEAN_TYPES, OPEN_STATUSES } from "./enums.js";

describe("BEAN_TYPES", () => {
  it("lists the hierarchy types from broadest to narrowest", () => {
    expect(BEAN_TYPES).toEqual(["milestone", "epic", "feature", "task", "bug"]);
  });
});

describe("BEAN_STATUSES", () => {
  it("lists every lifecycle status", () => {
    expect(BEAN_STATUSES).toEqual(["draft", "todo", "in-progress", "completed", "scrapped"]);
  });
});

describe("BEAN_PRIORITIES", () => {
  it("lists every priority level", () => {
    expect(BEAN_PRIORITIES).toEqual(["critical", "high", "normal", "low", "deferred"]);
  });
});

describe("OPEN_STATUSES", () => {
  it("is the subset of statuses considered still-open work", () => {
    expect(OPEN_STATUSES).toEqual(["draft", "todo", "in-progress"]);
  });

  it("only contains values that are also valid BEAN_STATUSES", () => {
    for (const status of OPEN_STATUSES) {
      expect(BEAN_STATUSES).toContain(status);
    }
  });

  it("excludes the terminal statuses", () => {
    expect(OPEN_STATUSES).not.toContain("completed");
    expect(OPEN_STATUSES).not.toContain("scrapped");
  });
});
