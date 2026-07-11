import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";

import { queryClient } from "./queryClient.js";

describe("queryClient", () => {
  it("is a QueryClient configured with a 5s stale time", () => {
    expect(queryClient).toBeInstanceOf(QueryClient);
    expect(queryClient.getDefaultOptions().queries?.staleTime).toBe(5_000);
  });
});
