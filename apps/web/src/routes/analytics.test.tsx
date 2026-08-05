import { screen } from "@testing-library/react";
import { cloneElement } from "react";
import { describe, expect, it, vi } from "vitest";

import { renderWithRouter } from "../test/renderWithRouter.js";

import { AnalyticsPage } from "./analytics.js";

import type { Analytics } from "@beans-web/shared";
import type { ReactElement } from "react";

const { useAnalyticsMock } = vi.hoisted(() => ({ useAnalyticsMock: vi.fn() }));

vi.mock("../hooks/useAnalytics.js", () => ({ useAnalytics: useAnalyticsMock }));

// jsdom has no layout engine, so Recharts' ResponsiveContainer measures a
// 0x0 box and renders nothing. Give the wrapped chart an explicit size
// (mirroring what ResponsiveContainer does at runtime) so charts render
// deterministically instead of depending on a ResizeObserver polyfill.
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
  perProject: [
    { project: "handbellhub", total: 10, open: 4 },
    { project: "beans", total: 6, open: 2 },
  ],
  byType: { milestone: 2, epic: 3, feature: 4, task: 5, bug: 2 },
  byStatus: { draft: 1, todo: 3, "in-progress": 2, completed: 9, scrapped: 1 },
  completedByMonth: [
    { month: "2026-05", count: 3 },
    { month: "2026-06", count: 6 },
  ],
  failures: [],
};

describe("AnalyticsPage", () => {
  it("renders headline totals and chart headings", async () => {
    useAnalyticsMock.mockReturnValue({ data: analytics, isPending: false, isError: false });

    const { container } = renderWithRouter(<AnalyticsPage />);
    await screen.findByText("Total beans");

    const totalValues = [...container.querySelectorAll(".analytics-total-value")].map(
      (el) => el.textContent,
    );
    expect(totalValues).toEqual(["16", "6"]);
    expect(screen.getByText("Total beans")).toBeInTheDocument();
    expect(screen.getByText("Open beans")).toBeInTheDocument();

    expect(screen.getByRole("heading", { name: "Beans per project" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Completed over time" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Beans by status" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Beans by type" })).toBeInTheDocument();
  });

  it("shows a loading message while pending", async () => {
    useAnalyticsMock.mockReturnValue({ data: undefined, isPending: true, isError: false });

    renderWithRouter(<AnalyticsPage />);

    expect(await screen.findByText("Loading analytics…")).toBeInTheDocument();
  });

  it("shows an error message when the query fails", async () => {
    useAnalyticsMock.mockReturnValue({ data: undefined, isPending: false, isError: true });

    renderWithRouter(<AnalyticsPage />);

    expect(await screen.findByText("Failed to load analytics.")).toBeInTheDocument();
  });

  it("shows an empty state when there is no project data", async () => {
    useAnalyticsMock.mockReturnValue({
      data: {
        perProject: [],
        byType: analytics.byType,
        byStatus: analytics.byStatus,
        completedByMonth: [],
        failures: [],
      },
      isPending: false,
      isError: false,
    });

    renderWithRouter(<AnalyticsPage />);

    expect(await screen.findByText("No analytics data yet.")).toBeInTheDocument();
  });

  it("warns when some projects failed to load", async () => {
    useAnalyticsMock.mockReturnValue({
      data: { ...analytics, failures: ["beans"] },
      isPending: false,
      isError: false,
    });

    renderWithRouter(<AnalyticsPage />);

    expect(await screen.findByText(/Some projects failed to load: beans/)).toBeInTheDocument();
  });
});
