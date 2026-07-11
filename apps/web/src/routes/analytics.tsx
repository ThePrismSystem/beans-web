import { Charts } from "../components/Charts.js";
import { useAnalytics } from "../hooks/useAnalytics.js";

import type { Analytics } from "@beans-frontend/shared";

function totals(analytics: Analytics): { total: number; open: number } {
  return analytics.perProject.reduce(
    (acc, p) => ({ total: acc.total + p.total, open: acc.open + p.open }),
    { total: 0, open: 0 },
  );
}

export function AnalyticsPage() {
  const { data: analytics, isPending, isError } = useAnalytics();

  if (isPending) {
    return <p className="muted">Loading analytics…</p>;
  }

  if (isError) {
    return <p className="muted">Failed to load analytics.</p>;
  }

  if (analytics.perProject.length === 0) {
    return <p className="muted">No analytics data yet.</p>;
  }

  const { total, open } = totals(analytics);

  return (
    <div>
      <h1>Analytics</h1>
      <div className="analytics-totals">
        <div className="analytics-total">
          <span className="analytics-total-value">{total}</span>
          <span className="analytics-total-label">Total beans</span>
        </div>
        <div className="analytics-total">
          <span className="analytics-total-value">{open}</span>
          <span className="analytics-total-label">Open beans</span>
        </div>
      </div>
      <Charts analytics={analytics} />
    </div>
  );
}
