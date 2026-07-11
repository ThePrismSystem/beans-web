import { render } from "@testing-library/react";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";

import type { RenderResult } from "@testing-library/react";
import type { ReactElement } from "react";

const Placeholder = () => <div>placeholder</div>;

function buildTestRouter(ui: ReactElement, initialLocation: string) {
  const rootRoute = createRootRoute();
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/",
    component: () => ui,
  });
  const projectRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/p/$project",
    component: Placeholder,
  });
  const beanRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/p/$project/$beanId",
    component: Placeholder,
  });
  const analyticsRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/analytics",
    component: Placeholder,
  });
  const searchRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/search",
    component: Placeholder,
  });

  return createRouter({
    routeTree: rootRoute.addChildren([
      indexRoute,
      projectRoute,
      beanRoute,
      analyticsRoute,
      searchRoute,
    ]),
    history: createMemoryHistory({ initialEntries: [initialLocation] }),
  });
}

type TestRouter = ReturnType<typeof buildTestRouter>;

/**
 * Mounts `ui` as the index route ("/") of a throwaway in-memory router so
 * components using `<Link>`/`useRouter` render without a full app router.
 * Registers the same paths the real router exposes so `<Link to="...">`
 * targets resolve.
 */
export function renderWithRouter(
  ui: ReactElement,
  initialLocation = "/",
): RenderResult & { router: TestRouter } {
  const router = buildTestRouter(ui, initialLocation);
  return { ...render(<RouterProvider router={router} />), router };
}
