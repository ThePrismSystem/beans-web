import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { BEAN_STATUSES, BEAN_TYPES } from "@beans-frontend/shared";

import { STATUS_LABEL } from "./StatusDot.js";

import type { ReactNode } from "react";
import type { Analytics, BeanStatus, BeanType } from "@beans-frontend/shared";

/**
 * Editorial chart palette. Mirrors the per-type (`--t-*`) and per-status
 * (`--s-*`) hues in theme/tokens.css so charts read consistently with the
 * BeanTypeTag/StatusDot chips used elsewhere in the app. Muted, no neon or
 * rainbow defaults.
 */
const CHART_TYPE_COLORS: Record<BeanType, string> = {
  milestone: "#5a4a8a",
  epic: "#9a6b1f",
  feature: "#3f6b5f",
  task: "#7a7f88",
  bug: "#a5452f",
};

const CHART_STATUS_COLORS: Record<BeanStatus, string> = {
  draft: "#8a857b",
  todo: "#55707a",
  "in-progress": "#9a6b1f",
  completed: "#3f6b5f",
  scrapped: "#a5452f",
};

const CHART_ACCENT = "#9a6b1f";
const CHART_NEUTRAL = "#8a857b";
const CHART_HAIRLINE = "#ddd5c4";
const CHART_HEIGHT = 240;

const AXIS_TICK = { fontSize: 12, fill: "var(--muted, #8a857b)" };

function ChartSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="chart-section">
      <h3>{title}</h3>
      <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
        {children}
      </ResponsiveContainer>
    </section>
  );
}

function BeansPerProjectChart({ data }: { data: Analytics["perProject"] }) {
  return (
    <ChartSection title="Beans per project">
      <BarChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke={CHART_HAIRLINE} />
        <XAxis dataKey="project" tick={AXIS_TICK} />
        <YAxis allowDecimals={false} tick={AXIS_TICK} />
        <Tooltip />
        <Legend />
        <Bar dataKey="total" name="Total" fill={CHART_ACCENT} radius={[4, 4, 0, 0]} />
        <Bar dataKey="open" name="Open" fill={CHART_NEUTRAL} radius={[4, 4, 0, 0]} />
      </BarChart>
    </ChartSection>
  );
}

function CompletedOverTimeChart({ data }: { data: Analytics["completedByMonth"] }) {
  return (
    <ChartSection title="Completed over time">
      <AreaChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke={CHART_HAIRLINE} />
        <XAxis dataKey="month" tick={AXIS_TICK} />
        <YAxis allowDecimals={false} tick={AXIS_TICK} />
        <Tooltip />
        <Area
          type="monotone"
          dataKey="count"
          name="Completed"
          stroke={CHART_STATUS_COLORS.completed}
          fill={CHART_STATUS_COLORS.completed}
          fillOpacity={0.25}
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
    <ChartSection title="Beans by status">
      <BarChart data={rows} layout="vertical">
        <CartesianGrid strokeDasharray="3 3" stroke={CHART_HAIRLINE} />
        <XAxis type="number" allowDecimals={false} tick={AXIS_TICK} />
        <YAxis type="category" dataKey="label" tick={AXIS_TICK} width={90} />
        <Tooltip />
        <Bar dataKey="count" name="Beans" radius={[0, 4, 4, 0]}>
          {rows.map((row) => (
            <Cell key={row.status} fill={CHART_STATUS_COLORS[row.status]} />
          ))}
        </Bar>
      </BarChart>
    </ChartSection>
  );
}

function ByTypeChart({ data }: { data: Record<BeanType, number> }) {
  const rows = BEAN_TYPES.map((type) => ({ type, count: data[type] ?? 0 }));
  return (
    <ChartSection title="Beans by type">
      <BarChart data={rows} layout="vertical">
        <CartesianGrid strokeDasharray="3 3" stroke={CHART_HAIRLINE} />
        <XAxis type="number" allowDecimals={false} tick={AXIS_TICK} />
        <YAxis type="category" dataKey="type" tick={AXIS_TICK} width={90} />
        <Tooltip />
        <Bar dataKey="count" name="Beans" radius={[0, 4, 4, 0]}>
          {rows.map((row) => (
            <Cell key={row.type} fill={CHART_TYPE_COLORS[row.type]} />
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
