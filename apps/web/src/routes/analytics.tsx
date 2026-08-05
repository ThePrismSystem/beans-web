import { Charts } from "../components/Charts.js";
import { useAnalytics } from "../hooks/useAnalytics.js";
import { useDocumentTitle } from "../hooks/useDocumentTitle.js";

import type { Analytics } from "@beans-web/shared";

function totals(analytics: Analytics): { total: number; open: number } {
  return analytics.perProject.reduce(
    (acc, p) => ({ total: acc.total + p.total, open: acc.open + p.open }),
    { total: 0, open: 0 },
  );
}

export function AnalyticsPage() {
  const { data: analytics, isPending, isError } = useAnalytics();
  useDocumentTitle("Analytics");

  if (isPending) {
    return (
      <p className="muted" role="status">
        Loading analytics…
      </p>
    );
  }

  if (isError) {
    return (
      <p className="muted" role="alert">
        Failed to load analytics.
      </p>
    );
  }

  if (analytics.perProject.length === 0) {
    return (
      <p className="muted" role="status">
        No analytics data yet.
      </p>
    );
  }

  const { total, open } = totals(analytics);

  return (
    <div>
      <h1>Analytics</h1>
      {analytics.failures.length > 0 && (
        <p className="analytics-warning" role="status">
          Some projects failed to load: {analytics.failures.join(", ")}. Totals may be incomplete.
        </p>
      )}
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
