/**
 * ProjectDetailPage, ProjectStaffingPanel, CloseProjectDialog — US-PRJ-01, 02, 04.
 *
 * TWO RULES SHAPE THIS SCREEN.
 *
 * BR-P-11: rows are GROUPED BY MEMBER with a subtotal. Q4:B permits several concurrent
 * assignments of one person to one project, and two separate 30% rows for the same name read as
 * duplicated data rather than as a 60% total.
 *
 * BR-P-10: current and past are split by DATE, not status. An assignment ended early still
 * staffed the project while it ran, and filing it under "not current" would erase that.
 */

import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Button,
  Dialog,
  EmptyState,
  ErrorState,
  LoadingState,
  formatPercentage,
} from '../../shared/components';
import { useNameResolver, useOrgUnitResolver, today } from '../../shared/hooks/lookups';
import { useCanWrite } from '../../shared/session/SessionProvider';
import type { CloseProjectResult, StaffedMember } from '../../shared/api/types';
import { useMembers } from '../members/api';
import { useCloseProject, useProject, useReopenProject, useStaffing } from './api';

export function ProjectDetailPage(): JSX.Element {
  const { id } = useParams<{ id: string }>();
  const projectId = id as string;
  const navigate = useNavigate();
  const canWrite = useCanWrite();
  const asOf = today();

  const { data: project, isLoading, error, refetch } = useProject(projectId);
  const { data: staffing } = useStaffing(projectId, asOf);
  const orgUnitName = useOrgUnitResolver();
  const typeName = useNameResolver('PROJECT_TYPE');

  const close = useCloseProject(projectId);
  const reopen = useReopenProject(projectId);
  const [preview, setPreview] = useState<CloseProjectResult | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  if (isLoading) return <LoadingState />;
  if (error) return <ErrorState error={error} onRetry={() => void refetch()} />;
  if (!project) return <ErrorState error={new Error('That project could not be found.')} />;

  /** Step one of BR-P-06: preview. Writes nothing. */
  async function beginClose(): Promise<void> {
    const result = await close.mutateAsync(false);
    if (result.confirmationRequired) {
      setPreview(result);
      return;
    }
    // Nothing extended past today, so it closed immediately — no dialogue for a no-op.
    setNotice(`${project?.name ?? 'The project'} is closed. No assignments needed ending.`);
  }

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
            {project.code}
          </p>
          <h1 className="text-xl font-semibold tracking-tight text-slate-900">{project.name}</h1>
          <p className="mt-0.5 text-sm text-slate-500">
            {orgUnitName(project.owningOrgUnitId)} · {typeName(project.projectTypeId)} ·{' '}
            {project.startDate} → {project.plannedEndDate}
          </p>
          {project.status === 'CLOSED' ? (
            <p className="mt-1 text-sm font-medium text-slate-600" data-testid="closed-notice">
              Closed on {project.closedOn}. Kept for historical views.
            </p>
          ) : null}
        </div>

        {canWrite ? (
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => navigate(`/projects/${projectId}/edit`)}>
              Edit
            </Button>
            {project.status === 'ACTIVE' ? (
              <>
                <Button variant="secondary" onClick={() => navigate(`/assignments/new?projectId=${projectId}`)}>
                  Assign someone
                </Button>
                <Button variant="danger" onClick={() => void beginClose()} data-testid="close-project">
                  Close project
                </Button>
              </>
            ) : (
              <Button variant="secondary" onClick={() => void reopen.mutateAsync()}>
                Reopen
              </Button>
            )}
          </div>
        ) : null}
      </div>

      {project.description ? (
        <p className="mb-5 max-w-3xl text-sm text-slate-700">{project.description}</p>
      ) : null}

      {notice ? (
        <div
          className="mb-4 rounded border border-allocation-full/40 bg-allocation-full/5 px-3 py-2 text-sm text-slate-700"
          role="status"
          data-testid="close-result"
        >
          {notice}
        </div>
      ) : null}

      <ProjectStaffingPanel staffing={staffing} asOf={asOf} />

      {preview ? (
        <CloseProjectDialog
          projectName={project.name}
          preview={preview}
          pending={close.isPending}
          onCancel={() => setPreview(null)}
          onConfirm={async () => {
            const result = await close.mutateAsync(true);
            setPreview(null);
            setNotice(
              `${project.name} is closed. ${result.autoEndedAssignmentCount} assignment${result.autoEndedAssignmentCount === 1 ? '' : 's'} ended.`,
            );
          }}
        />
      ) : null}
    </div>
  );
}

function ProjectStaffingPanel({
  staffing,
  asOf,
}: {
  staffing: { current: StaffedMember[]; past: StaffedMember[]; isUnstaffed: boolean } | undefined;
  asOf: string;
}): JSX.Element {
  const { data: members } = useMembers({
    search: '',
    orgUnitIds: [],
    employmentType: '',
    status: '',
    skillIds: [],
    roleId: '',
    offset: 0,
    limit: 200,
  });

  const nameOf = (memberId: string): string =>
    members?.items.find((member) => member.id === memberId)?.fullName ?? memberId;

  if (!staffing) return <LoadingState label="Loading staffing" />;

  // BR-P-09: "no assignments at all" is stated, not implied by an empty table.
  if (staffing.isUnstaffed) {
    return (
      <EmptyState
        message="Nobody is assigned to this project."
        hint="Assign someone to start tracking allocation against it."
        testId="unstaffed"
      />
    );
  }

  return (
    <div className="grid gap-5 lg:grid-cols-2" data-testid="staffing-panel">
      <StaffingGroup
        title={`On the project today (${asOf})`}
        rows={staffing.current}
        nameOf={nameOf}
        emptyMessage="Nobody is on it today."
        testId="staffing-current"
      />
      <StaffingGroup
        title="Previously on the project"
        rows={staffing.past}
        nameOf={nameOf}
        emptyMessage="No past assignments."
        testId="staffing-past"
      />
    </div>
  );
}

function StaffingGroup({
  title,
  rows,
  nameOf,
  emptyMessage,
  testId,
}: {
  title: string;
  rows: StaffedMember[];
  nameOf: (memberId: string) => string;
  emptyMessage: string;
  testId: string;
}): JSX.Element {
  return (
    <section className="rounded border border-slate-200 bg-white p-4" data-testid={testId}>
      <h2 className="mb-3 text-sm font-semibold text-slate-700">{title}</h2>

      {rows.length === 0 ? (
        <p className="text-sm text-slate-500">{emptyMessage}</p>
      ) : (
        <ul className="space-y-3">
          {rows.map((row) => (
            <li key={row.memberId} data-testid={`staffed-${row.memberId}`}>
              <div className="flex items-baseline justify-between">
                <span className="text-sm font-medium text-slate-900">{nameOf(row.memberId)}</span>
                {/* The SUBTOTAL is the point of the grouping (BR-P-11). */}
                <span className="text-sm font-semibold tabular-nums text-slate-800">
                  {formatPercentage(row.subtotalTenths / 10)}
                </span>
              </div>

              {/* Individual assignments listed beneath, so the subtotal is explainable. */}
              <ul className="mt-1 space-y-0.5 pl-3 text-xs text-slate-500">
                {row.assignments.map((assignment) => (
                  <li key={assignment.id} className="flex justify-between tabular-nums">
                    <span>
                      {assignment.startDate} → {assignment.endDate}
                    </span>
                    <span>{formatPercentage(assignment.allocationTenths / 10)}</span>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/**
 * CloseProjectDialog — BR-P-06/BR-P-07's second step.
 *
 * Lists exactly whose work would be ended. Closing a project silently would be
 * indistinguishable from data loss to the people whose assignments vanished.
 */
function CloseProjectDialog({
  projectName,
  preview,
  pending,
  onConfirm,
  onCancel,
}: {
  projectName: string;
  preview: CloseProjectResult;
  pending: boolean;
  onConfirm: () => Promise<void>;
  onCancel: () => void;
}): JSX.Element {
  const { data: members } = useMembers({
    search: '',
    orgUnitIds: [],
    employmentType: '',
    status: '',
    skillIds: [],
    roleId: '',
    offset: 0,
    limit: 200,
  });

  const nameOf = (memberId: string): string =>
    members?.items.find((member) => member.id === memberId)?.fullName ?? memberId;

  return (
    <Dialog
      title={`Close ${projectName}?`}
      tone="warning"
      onClose={onCancel}
      testId="close-project-dialog"
      footer={
        <>
          <Button variant="secondary" onClick={onCancel}>
            Keep it open
          </Button>
          <Button variant="danger" onClick={() => void onConfirm()} disabled={pending} data-testid="confirm-close">
            {pending ? 'Closing…' : `Close and end ${preview.openAssignments.length}`}
          </Button>
        </>
      }
    >
      <p className="text-sm text-slate-700">
        {preview.openAssignments.length} assignment
        {preview.openAssignments.length === 1 ? '' : 's'} run past today and will be ended as of
        today:
      </p>

      <ul className="mt-3 space-y-1 rounded border border-slate-200 bg-slate-50 p-3 text-sm">
        {preview.openAssignments.map((assignment) => (
          <li key={assignment.id} className="flex justify-between tabular-nums">
            <span className="text-slate-800">{nameOf(assignment.memberId)}</span>
            <span className="text-slate-600">
              {formatPercentage(assignment.allocationTenths / 10)} · to {assignment.endDate}
            </span>
          </li>
        ))}
      </ul>

      <p className="mt-3 text-sm text-slate-600">
        Reopening the project later <strong>does not</strong> restore these assignments.
      </p>
    </Dialog>
  );
}
