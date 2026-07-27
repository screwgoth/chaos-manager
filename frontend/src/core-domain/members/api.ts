/** Member data hooks. */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, query } from '../../shared/api/client';
import { invalidations, queryKeys } from '../../shared/api/queries';
import type {
  DeactivateMemberResult,
  EmploymentType,
  Member,
  MemberStatus,
  MemberSummary,
  Page,
} from '../../shared/api/types';

export interface MemberFilters {
  search: string;
  orgUnitIds: string[];
  employmentType: EmploymentType | '';
  status: MemberStatus | '';
  skillIds: string[];
  roleId: string;
  offset: number;
  limit: number;
}

export const emptyFilters: MemberFilters = {
  search: '',
  orgUnitIds: [],
  employmentType: '',
  // Defaults to ACTIVE: a resourcing screen is about who can be booked, and deactivated
  // members are excluded from assignable lists anyway (BR-M-14). They remain reachable by
  // switching this filter, which is what "retained in historical views" requires.
  status: 'ACTIVE',
  skillIds: [],
  roleId: '',
  offset: 0,
  limit: 25,
};

export function useMembers(filters: MemberFilters) {
  return useQuery({
    queryKey: queryKeys.members(filters),
    queryFn: () =>
      api.get<Page<MemberSummary>>(
        `/api/members${query({
          search: filters.search,
          orgUnitIds: filters.orgUnitIds,
          employmentType: filters.employmentType,
          status: filters.status,
          skillIds: filters.skillIds,
          roleId: filters.roleId,
          offset: filters.offset,
          limit: filters.limit,
        })}`,
      ),
  });
}

export function useMember(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.member(id ?? 'none'),
    queryFn: () => api.get<Member>(`/api/members/${id as string}`),
    enabled: id !== undefined,
  });
}

export function useOwnMember() {
  return useQuery({
    queryKey: queryKeys.member('me'),
    queryFn: () => api.get<Member>('/api/members/me'),
  });
}

export function useSaveMember(id?: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: unknown) =>
      id === undefined
        ? api.post<Member>('/api/members', body)
        : api.patch<Member>(`/api/members/${id}`, body),
    onSuccess: (member) => invalidations.member(client, member.id),
  });
}

export function useDeactivateMember() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      api.post<DeactivateMemberResult>(`/api/members/${id}/deactivate`),
    onSuccess: (result) => invalidations.member(client, result.member.id),
  });
}

export function useReactivateMember() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.post<{ member: Member }>(`/api/members/${id}/reactivate`),
    onSuccess: (result) => invalidations.member(client, result.member.id),
  });
}

export function useAttachSkill(memberId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (skillId: string) =>
      api.post<Member>(`/api/members/${memberId}/skills`, { skillId }),
    onSuccess: () => invalidations.member(client, memberId),
  });
}

export function useDetachSkill(memberId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (skillId: string) =>
      api.delete<Member>(`/api/members/${memberId}/skills/${skillId}`),
    onSuccess: () => invalidations.member(client, memberId),
  });
}
