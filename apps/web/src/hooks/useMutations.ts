import {
  ADD_BLOCKED_BY_MUTATION,
  ADD_BLOCKING_MUTATION,
  CREATE_BEAN_MUTATION,
  DELETE_BEAN_MUTATION,
  REMOVE_BLOCKED_BY_MUTATION,
  REMOVE_BLOCKING_MUTATION,
  SET_PARENT_MUTATION,
  UPDATE_BEAN_MUTATION,
} from "@beans-frontend/shared/graphql";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { projectGraphql } from "../api/client.js";

import type { CreateBeanInput, UpdateBeanInput } from "../api/generated.js";
import type { QueryClient, UseMutationResult } from "@tanstack/react-query";

const ETAG_CONFLICT_PATTERN = /etag mismatch/i;

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
          input: { ...v.input, ifMatch: v.etag },
        },
      );
      return data.updateBean;
    },
    onSuccess: (_data, v) => invalidateBean(qc, project, v.id),
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
    onSuccess: (_data, v) => invalidateBean(qc, project, v.id),
  });
}

export interface SetParentVariables {
  id: string;
  parentId: string | null;
  etag: string;
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
        ifMatch: v.etag,
      });
      return data.setParent;
    },
    onSuccess: (_data, v) => invalidateBean(qc, project, v.id),
  });
}

export interface LinkVariables {
  id: string;
  targetId: string;
  etag: string;
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
        ifMatch: v.etag,
      });
      return data[resultKey];
    },
    onSuccess: (_data, v) => invalidateBean(qc, project, v.id),
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
