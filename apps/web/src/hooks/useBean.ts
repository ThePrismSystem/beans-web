import { BEAN_DETAIL_QUERY } from "@beans-frontend/shared/graphql";
import { useQuery } from "@tanstack/react-query";

import { projectGraphql } from "../api/client.js";

import type { BeanDetail, LinkedBean } from "@beans-frontend/shared";
import type { UseQueryResult } from "@tanstack/react-query";

interface BeanDetailQueryResult {
  // `blocksInbound` is a sibling of `bean` in the document, not a field on it,
  // because it comes from a separate top-level `beans(filter:)` call.
  bean: Omit<BeanDetail, "blocksInbound"> | null;
  blocksInbound: LinkedBean[];
}

export function useBean(project: string, id: string): UseQueryResult<BeanDetail> {
  return useQuery({
    queryKey: ["bean", project, id],
    queryFn: async ({ signal }) => {
      const data = await projectGraphql<BeanDetailQueryResult>(
        project,
        BEAN_DETAIL_QUERY,
        { id, idStr: id },
        signal,
      );
      if (!data.bean) {
        throw new Error(`bean not found: ${id}`);
      }
      return { ...data.bean, blocksInbound: data.blocksInbound };
    },
  });
}
