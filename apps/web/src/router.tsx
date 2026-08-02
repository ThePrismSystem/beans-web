import { createRootRoute, createRoute, createRouter } from "@tanstack/react-router";
import { lazy } from "react";

import { AppShell } from "./components/AppShell.js";
import { Overview } from "./routes/overview.js";
import { ProjectList, validateProjectSearch } from "./routes/projectList.js";
import { SearchPage, validateSearchPageSearch } from "./routes/search.js";

// Analytics pulls in the charting library; code-split it so it isn't in the
// initial bundle. Rendered under the Suspense boundary in AppShell.
const AnalyticsPage = lazy(() =>
  import("./routes/analytics.js").then((m) => ({ default: m.AnalyticsPage })),
);

// Bean detail is the only consumer of the markdown renderer (marked +
// DOMPurify, ~60kB). Splitting the route keeps that out of the entry chunk, so
// the overview and project list don't pay to parse a renderer they never call.
const BeanDetailPage = lazy(() =>
  import("./routes/beanDetail.js").then((m) => ({ default: m.BeanDetailPage })),
);

const rootRoute = createRootRoute({ component: AppShell });

const overviewRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: Overview,
});

const projectRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/p/$project",
  validateSearch: validateProjectSearch,
  component: ProjectList,
});

const beanRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/p/$project/$beanId",
  component: BeanDetailPage,
});

const analyticsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/analytics",
  component: AnalyticsPage,
});

const searchRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/search",
  validateSearch: validateSearchPageSearch,
  component: SearchPage,
});

const routeTree = rootRoute.addChildren([
  overviewRoute,
  projectRoute,
  beanRoute,
  analyticsRoute,
  searchRoute,
]);

export const router = createRouter({ routeTree });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
