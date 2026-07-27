/** Assignment data hooks, including the two-step override protocol. */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, query } from '../../shared/api/client';
import { invalidations, queryKeys } from '../../shared/api/queries';
import type { Assignment, AssignmentWriteResult, DateRange, HistoricalRevision } from '../../shared/api/types';

export interface AssignmentPayload {
  memberId: string;
  projectId: string;
  allocationPercentage: number;
  period: DateRange;
  projectRoleId: string | null;
}

/**
 * Create or edit.
 *
 * `overrideOverAllocation` is passed on the SECOND call. The first returns
 * `requiresOverrideConfirmation` with the offending sub-periods and writes nothing (BR-A-10), so
 * the cache is only invalidated when an assignment actually came back.
 */
export function useSaveAssignment(id?: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({
      payload,
      override,
    }: {
      payload: AssignmentPayload;
      override: boolean;
    }) =>
      id === undefined
        ? api.post<AssignmentWriteResult>('/api/assignments', {
            ...payload,
            overrideOverAllocation: override,
          })
        : api.patch<AssignmentWriteResult>(`/api/assignments/${id}`, {
            allocationPercentage: payload.allocationPercentage,
            period: payload.period,
            projectRoleId: payload.projectRoleId,
            overrideOverAllocation: override,
          }),
    onSuccess: (result, variables) => {
      if (result.assignment !== null) {
        invalidations.assignment(client, variables.payload.memberId, variables.payload.projectId);
      }
    },
  });
}

export function useEndAssignment(id: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (effectiveEndDate: string) =>
      api.post<Assignment>(`/api/assignments/${id}/end`, { effectiveEndDate }),
    onSuccess: (assignment) =>
      invalidations.assignment(client, assignment.memberId, assignment.projectId),
  });
}

export function useAssignment(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.assignments({ id }),
    queryFn: () => api.get<Assignment>(`/api/assignments/${id as string}`),
    enabled: id !== undefined,
  });
}

export function useOwnAssignments(range: DateRange | null) {
  return useQuery({
    queryKey: queryKeys.assignments({ own: true, range }),
    queryFn: () =>
      api.get<{ items: Assignment[] }>(
        `/api/assignments${query({ start: range?.start, end: range?.end })}`,
      ),
    select: (response) => response.items,
  });
}

/** US-ASN-07 — Path B. The response says so, and the UI must label it. */
export function useHistoricalAllocation(asOf: string, range: DateRange, memberIds: string[]) {
  return useQuery({
    queryKey: queryKeys.assignmentsAsOf(asOf, { range, memberIds }),
    queryFn: () =>
      api.get<{ asOf: string; source: string; items: HistoricalRevision[] }>(
        `/api/assignments/as-of${query({
          asOf,
          start: range.start,
          end: range.end,
          memberIds,
        })}`,
      ),
    enabled: memberIds.length > 0,
  });
}
