import { BEAN_DETAIL_QUERY } from "@beans-frontend/shared/graphql";
import { useQuery } from "@tanstack/react-query";

import { projectGraphql } from "../api/client.js";

import type { LinkedBean } from "../components/LinkedBeans.js";
import type { UseQueryResult } from "@tanstack/react-query";
import type { Bean } from "@beans-frontend/shared";

export interface BeanDetail extends Bean {
  parent: LinkedBean | null;
  children: LinkedBean[];
  blocking: LinkedBean[];
  blockedBy: LinkedBean[];
}

interface BeanDetailQueryResult {
  bean: BeanDetail | null;
}

export function useBean(project: string, id: string): UseQueryResult<BeanDetail> {
  return useQuery({
    queryKey: ["bean", project, id],
    queryFn: async () => {
      const data = await projectGraphql<BeanDetailQueryResult>(project, BEAN_DETAIL_QUERY, {
        id,
      });
      if (!data.bean) {
        throw new Error(`bean not found: ${id}`);
      }
      return data.bean;
    },
  });
}
