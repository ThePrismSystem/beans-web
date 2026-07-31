import { useQuery } from "@tanstack/react-query";

import { projectGraphql } from "../api/client.js";

import type { BeanFilterInput } from "../lib/filter.js";
import type { BeanFilter } from "../api/generated.js";
import type { UseQueryResult } from "@tanstack/react-query";
import type { Bean } from "@beans-frontend/shared";

const BEANS_QUERY = `
  query Beans($filter: BeanFilter) {
    beans(filter: $filter) {
      id
      slug
      path
      title
      status
      type
      priority
      tags
      createdAt
      updatedAt
      body
      etag
      parentId
      blockingIds
      blockedByIds
    }
  }
`;

function toGraphqlFilter(filter: BeanFilterInput): Partial<BeanFilter> {
  const graphqlFilter: Partial<BeanFilter> = {};
  if (filter.type.length > 0) graphqlFilter.type = filter.type;
  if (filter.status.length > 0) graphqlFilter.status = filter.status;
  if (filter.priority.length > 0) graphqlFilter.priority = filter.priority;
  if (filter.tags.length > 0) graphqlFilter.tags = filter.tags;
  const search = filter.search.trim();
  if (search.length > 0) graphqlFilter.search = search;
  return graphqlFilter;
}

interface BeansQueryResult {
  beans: Bean[];
}

export function useBeans(project: string, filter: BeanFilterInput): UseQueryResult<Bean[]> {
  return useQuery({
    queryKey: ["beans", project, filter],
    queryFn: async () => {
      const data = await projectGraphql<BeansQueryResult>(project, BEANS_QUERY, {
        filter: toGraphqlFilter(filter),
      });
      return data.beans;
    },
  });
}
