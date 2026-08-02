import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { BEAN_STATUSES, BEAN_TYPES } from "@beans-frontend/shared";

import { STATUS_LABEL } from "./StatusDot.js";

import type { ReactNode } from "react";
import type { Analytics, BeanStatus, BeanType } from "@beans-frontend/shared";

const CHART_HEIGHT = 240;

/**
 * Series color is applied from the stylesheet, not from `fill`/`stroke`
 * props. recharts writes those as SVG presentation attributes, where `var()`
 * does not parse — which is why this file used to carry a parallel set of
 * literal hexes that never followed the theme. A CSS rule outranks a
 * presentation attribute, so `.chart-fill-*` in global.css can hand every mark
 * a `light-dark()` token and dark mode just works. See `--c-*` in tokens.css
 * for why the status series don't reuse the status-dot hues.
 */
const AXIS_TICK = { fontSize: 12 };

const TOOLTIP_STYLE = {
  background: "var(--paper)",
  border: "1px solid var(--hairline)",
  borderRadius: "var(--r-sm)",
  color: "var(--ink)",
};

const TOOLTIP_CURSOR = { fill: "var(--hairline)", fillOpacity: 0.4 };

interface TableSpec {
  columns: string[];
  rows: (string | number)[][];
}

/**
 * A chart is non-text content (WCAG 1.1.1). Each one ships the same numbers as
 * a table that only assistive tech reads, so nothing is conveyed by the SVG
 * alone.
 */
function ChartTable({ title, spec }: { title: string; spec: TableSpec }) {
  return (
    <table className="chart-table visually-hidden">
      <caption>{title}</caption>
      <thead>
        <tr>
          {spec.columns.map((column) => (
            <th key={column} scope="col">
              {column}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {spec.rows.map((row) => (
          <tr key={String(row[0])}>
            <th scope="row">{row[0]}</th>
            {row.slice(1).map((cell, index) => (
              <td key={spec.columns[index + 1] ?? index}>{cell}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** HTML legend, so swatches take their color from the same tokens as the marks. */
function ChartLegend({ items }: { items: { label: string; className: string }[] }) {
  return (
    <ul className="chart-legend">
      {items.map((item) => (
        <li key={item.label}>
          <span className={`chart-swatch ${item.className}`} aria-hidden="true" />
          {item.label}
        </li>
      ))}
    </ul>
  );
}

function ChartSection({
  title,
  table,
  legend,
  children,
}: {
  title: string;
  table: TableSpec;
  legend?: { label: string; className: string }[];
  children: ReactNode;
}) {
  return (
    <section className="chart-section">
      <h2>{title}</h2>
      {legend && <ChartLegend items={legend} />}
      <ChartTable title={title} spec={table} />
      <div aria-hidden="true">
        <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
          {children}
        </ResponsiveContainer>
      </div>
    </section>
  );
}

function BeansPerProjectChart({ data }: { data: Analytics["perProject"] }) {
  return (
    <ChartSection
      title="Beans per project"
      legend={[
        { label: "Total", className: "chart-swatch-total" },
        { label: "Open", className: "chart-swatch-open" },
      ]}
      table={{
        columns: ["Project", "Total", "Open"],
        rows: data.map((row) => [row.project, row.total, row.open]),
      }}
    >
      <BarChart data={data}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="project" tick={AXIS_TICK} />
        <YAxis allowDecimals={false} tick={AXIS_TICK} />
        <Tooltip contentStyle={TOOLTIP_STYLE} cursor={TOOLTIP_CURSOR} />
        <Bar dataKey="total" name="Total" className="chart-bar-total" radius={[4, 4, 0, 0]} />
        <Bar dataKey="open" name="Open" className="chart-bar-open" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ChartSection>
  );
}

function CompletedOverTimeChart({ data }: { data: Analytics["completedByMonth"] }) {
  return (
    <ChartSection
      title="Completed over time"
      table={{
        columns: ["Month", "Completed"],
        rows: data.map((row) => [row.month, row.count]),
      }}
    >
      <AreaChart data={data}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="month" tick={AXIS_TICK} />
        <YAxis allowDecimals={false} tick={AXIS_TICK} />
        <Tooltip contentStyle={TOOLTIP_STYLE} cursor={TOOLTIP_CURSOR} />
        <Area
          type="monotone"
          dataKey="count"
          name="Completed"
          className="chart-area-completed"
          strokeWidth={2}
        />
      </AreaChart>
    </ChartSection>
  );
}

function ByStatusChart({ data }: { data: Record<BeanStatus, number> }) {
  const rows = BEAN_STATUSES.map((status) => ({
    status,
    label: STATUS_LABEL[status],
    count: data[status] ?? 0,
  }));
  return (
    <ChartSection
      title="Beans by status"
      table={{
        columns: ["Status", "Beans"],
        rows: rows.map((row) => [row.label, row.count]),
      }}
    >
      <BarChart data={rows} layout="vertical">
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis type="number" allowDecimals={false} tick={AXIS_TICK} />
        <YAxis type="category" dataKey="label" tick={AXIS_TICK} width={90} />
        <Tooltip contentStyle={TOOLTIP_STYLE} cursor={TOOLTIP_CURSOR} />
        <Bar dataKey="count" name="Beans" radius={[0, 4, 4, 0]}>
          {rows.map((row) => (
            <Cell key={row.status} className={`chart-fill-${row.status}`} />
          ))}
        </Bar>
      </BarChart>
    </ChartSection>
  );
}

function ByTypeChart({ data }: { data: Record<BeanType, number> }) {
  const rows = BEAN_TYPES.map((type) => ({ type, count: data[type] ?? 0 }));
  return (
    <ChartSection
      title="Beans by type"
      table={{
        columns: ["Type", "Beans"],
        rows: rows.map((row) => [row.type, row.count]),
      }}
    >
      <BarChart data={rows} layout="vertical">
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis type="number" allowDecimals={false} tick={AXIS_TICK} />
        <YAxis type="category" dataKey="type" tick={AXIS_TICK} width={90} />
        <Tooltip contentStyle={TOOLTIP_STYLE} cursor={TOOLTIP_CURSOR} />
        <Bar dataKey="count" name="Beans" radius={[0, 4, 4, 0]}>
          {rows.map((row) => (
            <Cell key={row.type} className={`chart-fill-${row.type}`} />
          ))}
        </Bar>
      </BarChart>
    </ChartSection>
  );
}

/** All four analytics charts, wired to a single Analytics payload. */
export function Charts({ analytics }: { analytics: Analytics }) {
  return (
    <div className="chart-grid">
      <BeansPerProjectChart data={analytics.perProject} />
      <CompletedOverTimeChart data={analytics.completedByMonth} />
      <ByStatusChart data={analytics.byStatus} />
      <ByTypeChart data={analytics.byType} />
    </div>
  );
}
