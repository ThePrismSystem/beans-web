import { useQuery } from "@tanstack/react-query";

import { projectGraphql } from "../api/client.js";

import type { BeanListItem } from "@beans-web/shared";
import type { UseQueryResult } from "@tanstack/react-query";

// `body` is deliberately absent: no list row renders it, and leaving it out is
// what makes fetching a whole project at once cheap. The detail view fetches
// its own body through BEAN_DETAIL_QUERY.
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
      etag
      parentId
      blockingIds
      blockedByIds
    }
  }
`;

interface BeansQueryResult {
  beans: BeanListItem[];
}

/**
 * Fetches every bean in a project in one query.
 *
 * Only `search` goes over the wire — it is Bleve query syntax (fuzzy,
 * wildcard, phrase, boolean, field-scoped) and cannot be reproduced in the
 * browser. Type/status/priority/tags/prefix are applied client-side from this
 * single dataset, which is what lets the UI resolve a completed parent's
 * status and keeps the dataset identity stable when filters change.
 */
export function useProjectBeans(project: string, search: string): UseQueryResult<BeanListItem[]> {
  const trimmed = search.trim();
  return useQuery({
    queryKey: ["beans", project, trimmed],
    queryFn: async ({ signal }) => {
      const data = await projectGraphql<BeansQueryResult>(
        project,
        BEANS_QUERY,
        { filter: trimmed.length > 0 ? { search: trimmed } : {} },
        signal,
      );
      return data.beans;
    },
  });
}
