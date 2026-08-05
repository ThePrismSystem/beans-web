import {
  ADD_BLOCKED_BY_MUTATION,
  ADD_BLOCKING_MUTATION,
  CREATE_BEAN_MUTATION,
  DELETE_BEAN_MUTATION,
  REMOVE_BLOCKED_BY_MUTATION,
  REMOVE_BLOCKING_MUTATION,
  SET_PARENT_MUTATION,
  UPDATE_BEAN_MUTATION,
} from "@beans-web/shared/graphql";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { projectGraphql } from "../api/client.js";

import type { CreateBeanInput, UpdateBeanInput } from "../api/generated.js";
import type { BeanStatus } from "@beans-web/shared";
import type { QueryClient, UseMutationResult } from "@tanstack/react-query";

const ETAG_CONFLICT_PATTERN = /etag mismatch/i;

// NOTE: `useUpdateBean` still accepts an `etag` from the caller (the value
// most recently read for this bean) but does not forward it as `ifMatch`.
// The installed `beans` binary's mutation resolvers validate `ifMatch`
// against a value that disagrees with the etag its own queries and
// `beans show --etag-only` report for the identical, untouched bean — every
// etag-guarded mutation is rejected with a false "etag mismatch", even
// immediately after a fresh read with no intervening write (reproduced
// against both a local build and the officially published `beans` release,
// see task-16-report.md). Until that's fixed upstream, mutations omit
// `ifMatch` entirely (the other mutations below don't even accept an `etag`
// variable); `isEtagConflict`/`describeMutationError` stay in place so the
// conflict UI resumes working the moment beans's etag check is fixed and
// starts returning genuine mismatches again.

/** True when a mutation error is a beans etag/optimistic-concurrency conflict. */
export function isEtagConflict(error: unknown): boolean {
  return error instanceof Error && ETAG_CONFLICT_PATTERN.test(error.message);
}

/**
 * Turns a mutation error into UI copy: a specific reload prompt for etag
 * conflicts, the raw beans error message otherwise.
 */
export function describeMutationError(error: unknown): string {
  if (isEtagConflict(error)) {
    return "This bean changed on disk — reload to see the latest.";
  }
  if (error instanceof Error) {
    return error.message;
  }
  return "Something went wrong.";
}

interface MutatedBean {
  id: string;
  etag: string;
}

function invalidateBean(qc: QueryClient, project: string, id: string) {
  void qc.invalidateQueries({ queryKey: ["bean", project, id] });
  void qc.invalidateQueries({ queryKey: ["beans", project] });
  void qc.invalidateQueries({ queryKey: ["projects"] });
}

export interface UpdateBeanVariables {
  id: string;
  etag: string;
  input: Partial<UpdateBeanInput>;
}

export function useUpdateBean(
  project: string,
): UseMutationResult<MutatedBean, Error, UpdateBeanVariables> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: UpdateBeanVariables) => {
      const data = await projectGraphql<{ updateBean: MutatedBean }>(
        project,
        UPDATE_BEAN_MUTATION,
        {
          id: v.id,
          input: v.input,
        },
      );
      return data.updateBean;
    },
    onSuccess: (_data, v) => {
      invalidateBean(qc, project, v.id);
    },
  });
}

export function useCreateBean(
  project: string,
): UseMutationResult<MutatedBean, Error, Partial<CreateBeanInput>> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: Partial<CreateBeanInput>) => {
      const data = await projectGraphql<{ createBean: MutatedBean }>(
        project,
        CREATE_BEAN_MUTATION,
        {
          input,
        },
      );
      return data.createBean;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["beans", project] });
      void qc.invalidateQueries({ queryKey: ["projects"] });
    },
  });
}

export interface DeleteBeanVariables {
  id: string;
}

export function useDeleteBean(
  project: string,
): UseMutationResult<boolean, Error, DeleteBeanVariables> {
  const qc = useQueryClient();
  return useMutation({
    // Note: the beans GraphQL schema's `deleteBean(id: ID!): Boolean!` does
    // not accept an `ifMatch` argument, so a delete cannot be etag-guarded.
    mutationFn: async (v: DeleteBeanVariables) => {
      const data = await projectGraphql<{ deleteBean: boolean }>(project, DELETE_BEAN_MUTATION, {
        id: v.id,
      });
      return data.deleteBean;
    },
    onSuccess: (_data, v) => {
      invalidateBean(qc, project, v.id);
    },
  });
}

export interface SetParentVariables {
  id: string;
  parentId: string | null;
}

export function useSetParent(
  project: string,
): UseMutationResult<MutatedBean, Error, SetParentVariables> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: SetParentVariables) => {
      const data = await projectGraphql<{ setParent: MutatedBean }>(project, SET_PARENT_MUTATION, {
        id: v.id,
        parentId: v.parentId,
      });
      return data.setParent;
    },
    onSuccess: (_data, v) => {
      invalidateBean(qc, project, v.id);
    },
  });
}

export interface LinkVariables {
  id: string;
  targetId: string;
}

function useLinkMutation(
  project: string,
  query: string,
  resultKey: "addBlocking" | "removeBlocking" | "addBlockedBy" | "removeBlockedBy",
): UseMutationResult<MutatedBean, Error, LinkVariables> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: LinkVariables) => {
      const data = await projectGraphql<Record<typeof resultKey, MutatedBean>>(project, query, {
        id: v.id,
        targetId: v.targetId,
      });
      return data[resultKey];
    },
    // A link touches both ends, and for an inbound removal `v.id` is the other
    // bean, so invalidating only it would leave the page you are on stale.
    onSuccess: (_data, v) => {
      invalidateBean(qc, project, v.id);
      invalidateBean(qc, project, v.targetId);
    },
  });
}

export function useAddBlocking(
  project: string,
): UseMutationResult<MutatedBean, Error, LinkVariables> {
  return useLinkMutation(project, ADD_BLOCKING_MUTATION, "addBlocking");
}

export function useRemoveBlocking(
  project: string,
): UseMutationResult<MutatedBean, Error, LinkVariables> {
  return useLinkMutation(project, REMOVE_BLOCKING_MUTATION, "removeBlocking");
}

export function useAddBlockedBy(
  project: string,
): UseMutationResult<MutatedBean, Error, LinkVariables> {
  return useLinkMutation(project, ADD_BLOCKED_BY_MUTATION, "addBlockedBy");
}

export function useRemoveBlockedBy(
  project: string,
): UseMutationResult<MutatedBean, Error, LinkVariables> {
  return useLinkMutation(project, REMOVE_BLOCKED_BY_MUTATION, "removeBlockedBy");
}

/**
 * Thrown when a multi-ancestor re-open fails partway. There is no transaction
 * to roll back with, so the ancestors already written stay written and are
 * named in the message.
 */
export class ReopenPartialFailure extends Error {
  constructor(
    readonly reopenedIds: string[],
    cause: unknown,
  ) {
    const detail = cause instanceof Error ? cause.message : String(cause);
    super(
      reopenedIds.length > 0
        ? `Re-opened ${reopenedIds.join(", ")}, then failed: ${detail}`
        : `Re-open failed: ${detail}`,
    );
    this.name = "ReopenPartialFailure";
  }
}

export interface ReopenAncestorsVariables {
  /** Ancestor ids, nearest first — the order `closedAncestors` returns. */
  ancestorIds: string[];
  status: BeanStatus;
}

/**
 * Re-opens each ancestor to `status`, one at a time. Every call spawns a
 * `beans` process writing into the same project directory, so serializing the
 * writes avoids racing them. Invalidates once, after the chain settles.
 */
export function useReopenAncestors(
  project: string,
): UseMutationResult<{ reopenedIds: string[] }, Error, ReopenAncestorsVariables> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: ReopenAncestorsVariables) => {
      const reopenedIds: string[] = [];
      for (const id of v.ancestorIds) {
        try {
          await projectGraphql<{ updateBean: MutatedBean }>(project, UPDATE_BEAN_MUTATION, {
            id,
            input: { status: v.status },
          });
        } catch (err) {
          throw new ReopenPartialFailure(reopenedIds, err);
        }
        reopenedIds.push(id);
      }
      return { reopenedIds };
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ["beans", project] });
      void qc.invalidateQueries({ queryKey: ["bean", project] });
      void qc.invalidateQueries({ queryKey: ["projects"] });
    },
  });
}
