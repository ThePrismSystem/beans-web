import { cloneElement } from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { Charts } from "./Charts.js";

import type { ReactElement } from "react";
import type { Analytics, BeanStatus, BeanType } from "@beans-frontend/shared";

// jsdom has no layout engine, so Recharts' ResponsiveContainer measures a 0x0
// box and renders nothing. Give the wrapped chart an explicit size (mirroring
// what ResponsiveContainer does at runtime) so charts render deterministically
// instead of depending on a ResizeObserver polyfill.
interface SizedChartProps {
  width?: number;
  height?: number;
}

vi.mock("recharts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("recharts")>();
  return {
    ...actual,
    ResponsiveContainer: ({ children }: { children: ReactElement<SizedChartProps> }) =>
      cloneElement(children, { width: 400, height: 240 }),
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
  it("defaults missing status and type counts to zero instead of crashing", () => {
    render(<Charts analytics={analytics} />);

    expect(screen.getByRole("heading", { name: "Beans by status" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Beans by type" })).toBeInTheDocument();
  });
});
