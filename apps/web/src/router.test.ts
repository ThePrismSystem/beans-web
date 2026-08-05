import { describe, expect, it, vi } from "vitest";

import { router } from "./router.js";

import type { Project } from "@beans-web/shared";

const { useProjectsMock } = vi.hoisted(() => ({ useProjectsMock: vi.fn() }));

vi.mock("./hooks/useProjects.js", () => ({ useProjects: useProjectsMock }));

describe("router", () => {
  it("registers every top-level route path", () => {
    useProjectsMock.mockReturnValue({ data: [] as Project[], isPending: false, isError: false });

    expect(Object.keys(router.routesByPath).sort()).toEqual(
      ["/", "/analytics", "/p/$project", "/p/$project/$beanId", "/search"].sort(),
    );
  });
});
