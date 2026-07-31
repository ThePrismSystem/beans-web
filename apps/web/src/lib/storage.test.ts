import { afterEach, describe, expect, it, vi } from "vitest";

import { readString, readStringSet, writeString, writeStringSet } from "./storage.js";

afterEach(() => {
  window.localStorage.clear();
  vi.restoreAllMocks();
});

describe("readString / writeString", () => {
  it("round-trips a value", () => {
    writeString("k", "v");
    expect(readString("k")).toBe("v");
  });

  it("returns null for a missing key", () => {
    expect(readString("absent")).toBeNull();
  });

  it("falls back to memory when localStorage.setItem throws", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceededError");
    });
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("SecurityError");
    });

    writeString("k", "v");
    expect(readString("k")).toBe("v");
  });
});

describe("readStringSet / writeStringSet", () => {
  it("round-trips a set", () => {
    writeStringSet("ids", new Set(["a", "b"]));
    expect([...readStringSet("ids")].sort()).toEqual(["a", "b"]);
  });

  it("returns an empty set for a missing key", () => {
    expect(readStringSet("absent").size).toBe(0);
  });

  it("returns an empty set for corrupt JSON", () => {
    window.localStorage.setItem("ids", "{not json");
    expect(readStringSet("ids").size).toBe(0);
  });

  it("returns an empty set when the payload is not an array", () => {
    window.localStorage.setItem("ids", JSON.stringify({ a: 1 }));
    expect(readStringSet("ids").size).toBe(0);
  });

  it("drops non-string members", () => {
    window.localStorage.setItem("ids", JSON.stringify(["a", 3, null, "b"]));
    expect([...readStringSet("ids")].sort()).toEqual(["a", "b"]);
  });
});
