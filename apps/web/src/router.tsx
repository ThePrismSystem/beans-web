import { createRootRoute, createRoute, createRouter } from "@tanstack/react-router";

import { AppShell } from "./components/AppShell.js";
import { Overview } from "./routes/overview.js";

function ComingSoon() {
  return <div>Coming soon</div>;
}

const rootRoute = createRootRoute({ component: AppShell });

const overviewRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: Overview,
});

const projectRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/p/$project",
  component: ComingSoon,
});

const beanRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/p/$project/$beanId",
  component: ComingSoon,
});

const analyticsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/analytics",
  component: ComingSoon,
});

const searchRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/search",
  component: ComingSoon,
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
