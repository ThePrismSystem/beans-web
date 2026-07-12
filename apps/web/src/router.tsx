import { createRootRoute, createRoute, createRouter } from "@tanstack/react-router";
import { lazy } from "react";

import { AppShell } from "./components/AppShell.js";
import { BeanDetailPage } from "./routes/beanDetail.js";
import { Overview } from "./routes/overview.js";
import { ProjectList, validateProjectSearch } from "./routes/projectList.js";
import { SearchPage } from "./routes/search.js";

// Analytics pulls in the charting library; code-split it so it isn't in the
// initial bundle. Rendered under the Suspense boundary in AppShell.
const AnalyticsPage = lazy(() =>
  import("./routes/analytics.js").then((m) => ({ default: m.AnalyticsPage })),
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
  validateSearch: (search: Record<string, unknown>) => ({
    q: typeof search.q === "string" ? search.q : "",
  }),
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
