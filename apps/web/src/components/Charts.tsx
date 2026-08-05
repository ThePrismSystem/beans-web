import { BEAN_STATUSES, BEAN_TYPES } from "@beans-frontend/shared";
import { useId } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Rectangle,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { STATUS_LABEL } from "../lib/statusLabel.js";

import type { Analytics, BeanStatus, BeanType } from "@beans-frontend/shared";
import type { ReactNode } from "react";
import type { BarShapeProps } from "recharts";

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
function ChartTable({ labelledBy, spec }: { labelledBy: string; spec: TableSpec }) {
  return (
    // Named by the section's own heading rather than a <caption> repeating it,
    // which made screen readers announce the title twice in a row.
    <table className="chart-table visually-hidden" aria-labelledby={labelledBy}>
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
  const headingId = useId();
  return (
    <section className="chart-section" aria-labelledby={headingId}>
      <h2 id={headingId}>{title}</h2>
      {legend && <ChartLegend items={legend} />}
      <ChartTable labelledBy={headingId} spec={table} />
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

/**
 * Paints each bar from its own row's `fillClass` — a class, not a `fill` prop,
 * for the reason at the top of this file. `props.index` indexes the same array
 * the chart was handed, so the class stays aligned with the row it paints.
 */
function barShape(rows: readonly { fillClass: string }[]) {
  return function FilledBar(props: BarShapeProps) {
    const row = rows[props.index];
    return <Rectangle {...props} className={row?.fillClass} />;
  };
}

function ByStatusChart({ data }: { data: Record<BeanStatus, number> }) {
  // Widened to Partial: `data` crosses the GraphQL boundary, so a status the
  // server omitted (rather than sent as 0) must not throw on lookup here.
  const counts: Partial<Record<BeanStatus, number>> = data;
  const rows = BEAN_STATUSES.map((status) => ({
    status,
    label: STATUS_LABEL[status],
    count: counts[status] ?? 0,
    fillClass: `chart-fill-${status}`,
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
        <Bar dataKey="count" name="Beans" radius={[0, 4, 4, 0]} shape={barShape(rows)} />
      </BarChart>
    </ChartSection>
  );
}

function ByTypeChart({ data }: { data: Record<BeanType, number> }) {
  // Widened to Partial: `data` crosses the GraphQL boundary, so a type the
  // server omitted (rather than sent as 0) must not throw on lookup here.
  const counts: Partial<Record<BeanType, number>> = data;
  const rows = BEAN_TYPES.map((type) => ({
    type,
    count: counts[type] ?? 0,
    fillClass: `chart-fill-${type}`,
  }));
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
        <Bar dataKey="count" name="Beans" radius={[0, 4, 4, 0]} shape={barShape(rows)} />
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
