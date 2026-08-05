import { BEAN_STATUSES, BEAN_TYPES } from "@beans-frontend/shared";
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
    // A zero-value bar has zero width and Recharts skips rendering a <path>
    // for it entirely, and even a nonzero bar renders no <path> mid-entry
    // animation — both would make an SVG-based assertion pass or fail for
    // reasons unrelated to what it's checking. Forcing the shape to its
    // resting frame keeps the chart-fill-* assertions below meaningful.
    Bar: (props: ComponentProps<typeof actual.Bar>) => (
      <actual.Bar {...props} isAnimationActive={false} />
    ),
  };
});

const analytics: Analytics = {
  perProject: [{ project: "handbellhub", total: 10, open: 4 }],
  byType: { epic: 3 } as Record<BeanType, number>,
  byStatus: { todo: 3 } as Record<BeanStatus, number>,
  completedByMonth: [{ month: "2026-05", count: 3 }],
  failures: [],
};

// Every status/type has a distinct nonzero count so every bar actually
// renders (see the Bar mock above for why a zero-value bar wouldn't).
const multiValueAnalytics: Analytics = {
  ...analytics,
  byType: { milestone: 1, epic: 2, feature: 3, task: 4, bug: 5 },
  byStatus: { draft: 1, todo: 2, "in-progress": 3, completed: 4, scrapped: 5 },
};

describe("Charts", () => {
  beforeEach(() => {
    capturedBarChartData = [];
  });

  it("defaults a missing status count to zero instead of dropping the row", () => {
    render(<Charts analytics={analytics} />);

    expect(screen.getByRole("heading", { name: "Beans by status" })).toBeInTheDocument();
    const statusRows = capturedBarChartData.find((rows) => rows.some((row) => "status" in row));
    expect(statusRows).toContainEqual({
      status: "completed",
      label: "Completed",
      count: 0,
      fillClass: "chart-fill-completed",
    });
  });

  it("defaults a missing type count to zero instead of dropping the row", () => {
    render(<Charts analytics={analytics} />);

    expect(screen.getByRole("heading", { name: "Beans by type" })).toBeInTheDocument();
    const typeRows = capturedBarChartData.find((rows) => rows.some((row) => "type" in row));
    expect(typeRows).toContainEqual({ type: "bug", count: 0, fillClass: "chart-fill-bug" });
  });

  // Cell was replaced with a per-bar `shape` render function that looks up
  // its row by `props.index` into the same array BarChart was given — a
  // mismatch there would silently paint bars with the wrong status/type
  // color instead of throwing. One rendered <path> per class, one class per
  // status/type, proves the index lookup stays aligned to its row.
  it("colors each status bar with its own chart-fill-* class", () => {
    const { container } = render(<Charts analytics={multiValueAnalytics} />);

    for (const status of BEAN_STATUSES) {
      expect(container.querySelectorAll(`path.chart-fill-${status}`)).toHaveLength(1);
    }
  });

  it("colors each type bar with its own chart-fill-* class", () => {
    const { container } = render(<Charts analytics={multiValueAnalytics} />);

    for (const type of BEAN_TYPES) {
      expect(container.querySelectorAll(`path.chart-fill-${type}`)).toHaveLength(1);
    }
  });
});
