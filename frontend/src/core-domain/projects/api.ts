/** Project data hooks. */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, query } from '../../shared/api/client';
import { invalidations, queryKeys } from '../../shared/api/queries';
import type {
  CloseProjectResult,
  Page,
  Project,
  ProjectStaffing,
  ProjectStatus,
  ProjectSummary,
} from '../../shared/api/types';

export interface ProjectFilters {
  search: string;
  orgUnitIds: string[];
  projectTypeId: string;
  status: ProjectStatus | '';
  offset: number;
  limit: number;
}

export const emptyProjectFilters: ProjectFilters = {
  search: '',
  orgUnitIds: [],
  projectTypeId: '',
  // Active by default: closed projects stay reachable (BR-P-08 keeps them in historical views)
  // but a resourcing screen is about work in flight.
  status: 'ACTIVE',
  offset: 0,
  limit: 25,
};

export function useProjects(filters: ProjectFilters) {
  return useQuery({
    queryKey: queryKeys.projects(filters),
    queryFn: () =>
      api.get<Page<ProjectSummary>>(
        `/api/projects${query({
          search: filters.search,
          orgUnitIds: filters.orgUnitIds,
          projectTypeId: filters.projectTypeId,
          status: filters.status,
          offset: filters.offset,
          limit: filters.limit,
        })}`,
      ),
  });
}

export function useProject(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.project(id ?? 'none'),
    queryFn: () => api.get<Project>(`/api/projects/${id as string}`),
    enabled: id !== undefined,
  });
}

export function useOpenProjects(onDate: string) {
  return useQuery({
    queryKey: queryKeys.openProjects(onDate),
    queryFn: () =>
      api.get<{ items: ProjectSummary[] }>(`/api/projects/open${query({ onDate })}`),
    select: (response) => response.items,
  });
}

export function useStaffing(id: string, asOf: string) {
  return useQuery({
    queryKey: queryKeys.staffing(id, asOf),
    queryFn: () =>
      api.get<ProjectStaffing>(`/api/projects/${id}/staffing${query({ asOf })}`),
  });
}

export function useSaveProject(id?: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: unknown) =>
      id === undefined
        ? api.post<Project>('/api/projects', body)
        : api.patch<Project>(`/api/projects/${id}`, body),
    onSuccess: (project) => invalidations.project(client, project.id),
  });
}

/**
 * The two-phase close (BR-P-06).
 *
 * Called twice with the same id: first with `confirm: false` to preview, then with `true`. The
 * cache is invalidated only when something was actually written — invalidating after a preview
 * would refetch every allocation screen for a call that changed nothing.
 */
export function useCloseProject(id: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (confirm: boolean) =>
      api.post<CloseProjectResult>(`/api/projects/${id}/close`, {
        confirmOpenAssignments: confirm,
      }),
    onSuccess: (result) => {
      if (result.project !== null) invalidations.project(client, id);
    },
  });
}

export function useReopenProject(id: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<{ project: Project }>(`/api/projects/${id}/reopen`),
    onSuccess: () => invalidations.project(client, id),
  });
}
