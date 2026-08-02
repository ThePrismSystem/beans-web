import { render, screen } from "@testing-library/react";
import { cloneElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { Charts } from "./Charts.js";

import type { Analytics, BeanStatus, BeanType } from "@beans-frontend/shared";
import type { ComponentProps, ReactElement } from "react";

// jsdom has no layout engine, so Recharts' ResponsiveContainer measures a 0x0
// box and renders nothing. Give the wrapped chart an explicit size (mirroring
// what ResponsiveContainer does at runtime) so charts render deterministically
// instead of depending on a ResizeObserver polyfill.
interface SizedChartProps {
  width?: number;
  height?: number;
}

// Recharts animates bar entry by default, so in jsdom (no rAF-driven layout)
// the rendered <path> geometry never settles within a synchronous render —
// asserting on SVG output would only prove headings render, not that data is
// correct. Capture the `data` array each BarChart receives instead: that
// array is what determines whether a status/type missing from the analytics
// payload renders as a zero-valued row or silently drops the row entirely.
let capturedBarChartData: Record<string, unknown>[][] = [];

type BarChartRow = Record<string, unknown>;

vi.mock("recharts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("recharts")>();
  return {
    ...actual,
    ResponsiveContainer: ({ children }: { children: ReactElement<SizedChartProps> }) =>
      cloneElement(children, { width: 400, height: 240 }),
    BarChart: (props: ComponentProps<typeof actual.BarChart<BarChartRow>>) => {
      capturedBarChartData.push(props.data ? [...props.data] : []);
      return <actual.BarChart {...props} />;
    },
  };
});

const analytics: Analytics = {
  perProject: [{ project: "handbellhub", total: 10, open: 4 }],
  byType: { epic: 3 } as Record<BeanType, number>,
  byStatus: { todo: 3 } as Record<BeanStatus, number>,
  completedByMonth: [{ month: "2026-05", count: 3 }],
  failures: [],
};

describe("Charts", () => {
  beforeEach(() => {
    capturedBarChartData = [];
  });

  it("defaults a missing status count to zero instead of dropping the row", () => {
    render(<Charts analytics={analytics} />);

    expect(screen.getByRole("heading", { name: "Beans by status" })).toBeInTheDocument();
    const statusRows = capturedBarChartData.find((rows) => rows.some((row) => "status" in row));
    expect(statusRows).toContainEqual({ status: "completed", label: "Completed", count: 0 });
  });

  it("defaults a missing type count to zero instead of dropping the row", () => {
    render(<Charts analytics={analytics} />);

    expect(screen.getByRole("heading", { name: "Beans by type" })).toBeInTheDocument();
    const typeRows = capturedBarChartData.find((rows) => rows.some((row) => "type" in row));
    expect(typeRows).toContainEqual({ type: "bug", count: 0 });
  });
});
