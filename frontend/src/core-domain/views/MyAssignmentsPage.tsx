/**
 * MyAssignmentsPage — US-VIS-04. The Team Member's landing screen.
 *
 * Everything here resolves through the SESSION, never through an id in the URL. There is no
 * route parameter to change, which is what makes it structurally impossible to use this screen
 * to look at somebody else — and the server refuses anyway (proved in `api.test.ts`).
 */

import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api, query } from '../../shared/api/client';
import { queryKeys } from '../../shared/api/queries';
import {
  AllocationSegmentStrip,
  EmptyState,
  ErrorState,
  LoadingState,
  formatPercentage,
  presetRange,
} from '../../shared/components';
import { useNameResolver } from '../../shared/hooks/lookups';
import type { Assignment, TimelineSegment } from '../../shared/api/types';
import { useSession } from '../../shared/session/SessionProvider';
import { useOwnMember } from '../members/api';
import { useOwnAssignments } from '../assignments/api';

export function MyAssignmentsPage(): JSX.Element {
  const { user, ownMemberId } = useSession();
  const range = presetRange('thisQuarter');

  const { data: member, error: memberError } = useOwnMember();
  const { data: assignments, isLoading, error } = useOwnAssignments(null);
  const roleName = useNameResolver('ROLE');

  const { data: timeline } = useQuery({
    queryKey: queryKeys.memberTimeline(ownMemberId ?? 'none', range),
    queryFn: () =>
      api.get<{ items: TimelineSegment[] }>(
        `/api/allocations/members/${ownMemberId as string}/timeline${query({
          start: range.start,
          end: range.end,
        })}`,
      ),
    select: (response) => response.items,
    enabled: ownMemberId !== null,
  });

  // An account with no linked member record is a configuration gap, not a bug. Say so plainly
  // and name the fix, rather than showing an empty page.
  if (ownMemberId === null) {
    return (
      <EmptyState
        message="This account is not linked to a person record."
        hint="Ask an administrator to link it, and your assignments will appear here."
        testId="no-linked-member"
      />
    );
  }

  if (error || memberError) return <ErrorState error={error ?? memberError} />;
  if (isLoading) return <LoadingState />;

  const activeAssignments = (assignments ?? []).filter(
    (assignment) => assignment.status === 'ACTIVE',
  );

  return (
    <div>
      <div className="mb-5">
        <h1 className="text-[19px] font-semibold leading-tight text-ink">
          {member?.fullName ?? user?.username}
        </h1>
        <p className="mt-0.5 text-sm text-faded">
          {member ? roleName(member.roleId) : null} · your work this quarter
        </p>
      </div>

      <section className="mb-5 rounded-card bg-white shadow-card p-4">
        <h2 className="mb-3 text-sm font-semibold text-ink">Your quarter</h2>
        <AllocationSegmentStrip segments={timeline ?? []} range={range} testId="own-timeline" />
      </section>

      <section className="rounded-card bg-white shadow-card p-4">
        <h2 className="mb-3 text-sm font-semibold text-ink">Assignments</h2>

        {activeAssignments.length === 0 ? (
          <p className="text-sm text-faded">
            You have no current assignments. Your resource manager assigns work here.
          </p>
        ) : (
          <ul className="space-y-2">
            {activeAssignments.map((assignment) => (
              <AssignmentRow key={assignment.id} assignment={assignment} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function AssignmentRow({ assignment }: { assignment: Assignment }): JSX.Element {
  const { data: project } = useQuery({
    queryKey: queryKeys.project(assignment.projectId),
    queryFn: () =>
      api.get<{ id: string; code: string; name: string }>(`/api/projects/${assignment.projectId}`),
    // A Team Member can read the projects they are assigned to; if scope refuses, the id is
    // shown rather than a blank row.
    retry: false,
  });

  return (
    <li
      className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line-soft pb-2 last:border-b-0 last:pb-0"
      data-testid={`own-assignment-${assignment.id}`}
    >
      <div>
        <span className="text-sm font-medium text-ink">
          {project ? `${project.code} · ${project.name}` : assignment.projectId}
        </span>
        <span className="ml-2 text-xs tabular-nums text-faded">
          {assignment.startDate} → {assignment.endDate}
        </span>
      </div>
      <span className="text-sm font-semibold tabular-nums text-ink">
        {formatPercentage(assignment.allocationTenths / 10)}
      </span>
    </li>
  );
}
