import { renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { useDocumentTitle } from "./useDocumentTitle.js";

const ORIGINAL = document.title;

afterEach(() => {
  document.title = ORIGINAL;
});

describe("useDocumentTitle", () => {
  it("puts the view name ahead of the app name", () => {
    renderHook(() => {
      useDocumentTitle("Analytics");
    });

    expect(document.title).toBe("Analytics · beans");
  });

  it("falls back to the app name alone while the view name is unknown", () => {
    renderHook(() => {
      useDocumentTitle("");
    });

    expect(document.title).toBe("beans");
  });

  it("follows the title as it changes", () => {
    const { rerender } = renderHook(
      ({ title }) => {
        useDocumentTitle(title);
      },
      {
        initialProps: { title: "bf-1" },
      },
    );
    expect(document.title).toBe("bf-1 · beans");

    rerender({ title: "Fix the thing" });

    expect(document.title).toBe("Fix the thing · beans");
  });
});
