import { act, render } from "@testing-library/react";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { useState } from "react";

import type { RenderResult } from "@testing-library/react";
import type { Dispatch, ReactElement, SetStateAction } from "react";

const Placeholder = () => <div>placeholder</div>;

function buildTestRouter(IndexComponent: () => ReactElement, initialLocation: string) {
  const rootRoute = createRootRoute();
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/",
    component: IndexComponent,
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
 *
 * The returned `rerender` swaps the content held inside the mounted route
 * rather than replacing the render root, so the router context stays intact
 * across a rerender (RTL's default `rerender` would otherwise unmount
 * `RouterProvider` itself, since it was never part of `ui`).
 */
export function renderWithRouter(
  ui: ReactElement,
  initialLocation = "/",
): Omit<RenderResult, "rerender"> & {
  router: TestRouter;
  rerender: (next: ReactElement) => void;
} {
  let setCurrent: Dispatch<SetStateAction<ReactElement>> | undefined;
  function Slot() {
    const [current, setter] = useState(ui);
    setCurrent = setter;
    return current;
  }
  const router = buildTestRouter(Slot, initialLocation);
  const result = render(<RouterProvider router={router} />);
  return {
    ...result,
    router,
    rerender: (next: ReactElement) => {
      act(() => {
        setCurrent?.(next);
      });
    },
  };
}
