import { describe, expect, it, vi } from "vitest";

// saveField is not exported (it's file-private to beanDetail.tsx), so this
// test re-implements the same 4-line function to pin its contract. If
// beanDetail.tsx's saveField signature changes, update both.
function saveField<T extends string>(
  options: readonly T[],
  current: T,
  value: string,
  apply: (next: T) => void,
): void {
  const next = options.find((option) => option === value);
  if (next && next !== current) {
    apply(next);
  }
}

const COLORS = ["red", "green", "blue"] as const;

describe("saveField", () => {
  it("applies when the value differs from current", () => {
    const apply = vi.fn();
    saveField(COLORS, "red", "blue", apply);
    expect(apply).toHaveBeenCalledWith("blue");
  });

  it("does not apply when the value matches current", () => {
    const apply = vi.fn();
    saveField(COLORS, "red", "red", apply);
    expect(apply).not.toHaveBeenCalled();
  });

  it("does not apply when the value is not a valid option", () => {
    const apply = vi.fn();
    saveField(COLORS, "red", "purple", apply);
    expect(apply).not.toHaveBeenCalled();
  });
});
