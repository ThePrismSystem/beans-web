import { createRootRoute, createRoute, createRouter } from "@tanstack/react-router";

import { AppShell } from "./components/AppShell.js";
import { validateProjectSearch } from "./lib/projectSearch.js";
import { validateSearchPageSearch } from "./lib/searchPageSearch.js";
import { AnalyticsPage, BeanDetailPage } from "./routes/lazyRoutes.js";
import { Overview } from "./routes/overview.js";
import { ProjectList } from "./routes/projectList.js";
import { SearchPage } from "./routes/search.js";

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
