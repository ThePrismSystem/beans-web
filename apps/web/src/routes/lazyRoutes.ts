import { lazy } from "react";

// Analytics pulls in the charting library; code-split it so it isn't in the
// initial bundle. Rendered under the Suspense boundary in AppShell.
export const AnalyticsPage = lazy(() =>
  import("./analytics.js").then((m) => ({ default: m.AnalyticsPage })),
);

// Bean detail is the only consumer of the markdown renderer (marked +
// DOMPurify, ~60kB). Splitting the route keeps that out of the entry chunk, so
// the overview and project list don't pay to parse a renderer they never call.
export const BeanDetailPage = lazy(() =>
  import("./beanDetail.js").then((m) => ({ default: m.BeanDetailPage })),
);
