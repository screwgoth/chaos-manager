/**
 * Query keys and THE CACHE INVALIDATION MAP.
 *
 * This file is the answer to `frontend-components.md` §1's "the part that gets forgotten".
 * Assignment mutations change allocation figures on screens the user is not looking at, and
 * getting this wrong is why a UI shows a stale over-allocation after a save.
 *
 * Keys are hierarchical arrays, so invalidating `['allocations']` clears every allocation
 * query regardless of its filters — which is what the `allocations:*` wildcard in the design
 * table means in practice.
 */

import { QueryClient } from '@tanstack/react-query';

/**
 * Query keys, hierarchical so a prefix invalidates everything beneath it.
 *
 * `['allocations']` clears every allocation query regardless of filters — which is what the
 * `allocations:*` wildcard in the design table means in practice.
 *
 * Typed as `unknown[]` rather than const tuples: a ternary cannot carry an `as const`, and the
 * precise literal types buy nothing here because TanStack Query compares structurally.
 */
export const queryKeys = {
  session: (): unknown[] => ['session'],

  members: (filters?: unknown): unknown[] =>
    filters === undefined ? ['members'] : ['members', filters],
  member: (id: string): unknown[] => ['member', id],
  assignableMembers: (onDate: string): unknown[] => ['members', 'assignable', onDate],
  expiringContracts: (withinDays: number): unknown[] => ['members', 'expiring', withinDays],

  projects: (filters?: unknown): unknown[] =>
    filters === undefined ? ['projects'] : ['projects', filters],
  project: (id: string): unknown[] => ['project', id],
  openProjects: (onDate: string): unknown[] => ['projects', 'open', onDate],
  staffing: (id: string, asOf: string): unknown[] => ['staffing', id, asOf],

  assignments: (filters?: unknown): unknown[] =>
    filters === undefined ? ['assignments'] : ['assignments', filters],
  assignmentsAsOf: (asOf: string, range: unknown): unknown[] => ['assignments', 'as-of', asOf, range],

  allocations: (filters?: unknown): unknown[] =>
    filters === undefined ? ['allocations'] : ['allocations', filters],
  availability: (filters?: unknown): unknown[] =>
    filters === undefined ? ['availability'] : ['availability', filters],
  overAllocated: (range: unknown): unknown[] => ['allocations', 'over-allocated', range],
  unallocated: (range: unknown): unknown[] => ['allocations', 'unallocated', range],
  memberTimeline: (id: string, range: unknown): unknown[] => ['allocations', 'timeline', id, range],

  referenceData: (type: string): unknown[] => ['referenceData', type],
  orgUnits: (): unknown[] => ['orgUnits'],
  orgUnitHierarchy: (): unknown[] => ['orgUnits', 'hierarchy'],
};

/**
 * The invalidation map, transcribed from `frontend-components.md` §1.
 *
 * Each entry is deliberately BROADER than it might first appear. An assignment change alters
 * the allocation view, the availability search, the member's own page, the project's staffing
 * panel and the assignment lists — five screens, only one of which the user was looking at.
 * Under-invalidating here produces a UI that confidently shows an over-allocation the server
 * no longer has.
 */
export const invalidations = {
  /** Create, edit, or end an assignment. */
  assignment: (client: QueryClient, memberId?: string, projectId?: string): void => {
    void client.invalidateQueries({ queryKey: ['allocations'] });
    void client.invalidateQueries({ queryKey: ['availability'] });
    void client.invalidateQueries({ queryKey: ['assignments'] });
    void client.invalidateQueries({ queryKey: ['staffing'] });
    // Member and project detail carry allocation summaries.
    if (memberId) void client.invalidateQueries({ queryKey: ['member', memberId] });
    if (projectId) void client.invalidateQueries({ queryKey: ['project', projectId] });
  },

  /** Create, edit, or deactivate a member. */
  member: (client: QueryClient, memberId?: string): void => {
    void client.invalidateQueries({ queryKey: ['members'] });
    void client.invalidateQueries({ queryKey: ['allocations'] });
    void client.invalidateQueries({ queryKey: ['availability'] });
    if (memberId) void client.invalidateQueries({ queryKey: ['member', memberId] });
    // Deactivation auto-ends assignments, so those lists change too.
    void client.invalidateQueries({ queryKey: ['assignments'] });
  },

  /** Create, edit, or close a project. */
  project: (client: QueryClient, projectId?: string): void => {
    void client.invalidateQueries({ queryKey: ['projects'] });
    void client.invalidateQueries({ queryKey: ['allocations'] });
    void client.invalidateQueries({ queryKey: ['availability'] });
    void client.invalidateQueries({ queryKey: ['staffing'] });
    if (projectId) void client.invalidateQueries({ queryKey: ['project', projectId] });
    // Closing auto-ends assignments.
    void client.invalidateQueries({ queryKey: ['assignments'] });
  },

  /**
   * Reference data change.
   *
   * Members and projects are invalidated too, because their list views show role, skill and
   * project-type NAMES — renaming a role must not leave the old label on screen (BR-C-04
   * propagates by identifier server-side, but a cached page still holds the old string).
   */
  referenceData: (client: QueryClient, type?: string): void => {
    void client.invalidateQueries({ queryKey: type ? ['referenceData', type] : ['referenceData'] });
    void client.invalidateQueries({ queryKey: ['members'] });
    void client.invalidateQueries({ queryKey: ['projects'] });
  },

  /** Org unit change — same denormalised-label reasoning. */
  orgUnit: (client: QueryClient): void => {
    void client.invalidateQueries({ queryKey: ['orgUnits'] });
    void client.invalidateQueries({ queryKey: ['members'] });
    void client.invalidateQueries({ queryKey: ['projects'] });
  },
};

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        /**
         * 30 seconds. Allocation data changes when someone else edits an assignment, and a
         * manager comparing two screens must not see figures that disagree. Long enough to
         * avoid refetching on every navigation, short enough that a colleague's change
         * surfaces without a manual reload.
         */
        staleTime: 30_000,
        retry: (failureCount, error) => {
          // Never retry a rejection the server meant: a 4xx will fail identically every
          // time, and retrying a 401 would hammer the sign-in redirect.
          const status = (error as { status?: number }).status;
          if (status !== undefined && status >= 400 && status < 500) return false;
          return failureCount < 2;
        },
        refetchOnWindowFocus: true,
      },
      mutations: {
        // A failed write must not be retried automatically: the assignment create flow is a
        // two-step decision, and a silent retry could save something the user declined.
        retry: false,
      },
    },
  });
}
