/**
 * Assignment routes — US-ASN-01, 02, 03, 05, 06, 07.
 *
 * THE TWO-STEP OVERRIDE PROTOCOL (US-ASN-05) is implemented as a RE-SUBMIT, not a
 * confirmation token:
 *
 *   1. POST without `overrideOverAllocation` → if capacity is exceeded, **200** with
 *      `assignment: null`, `requiresOverrideConfirmation: true`, and each offending
 *      sub-period. Nothing is written (BR-A-10).
 *   2. POST again with `overrideOverAllocation: true` → saved, with `savedAsOverride: true`.
 *
 * Why re-submit rather than a token: a token would need server-side storage with its own
 * expiry, and would let a stale token authorise a save against capacity that has since
 * changed. Re-submitting re-runs the check against current data, inside the member lock.
 *
 * Why 200 and not 409: the warning IS the successful outcome of step one. BR-A-09 makes
 * over-allocation a warning permitting override, never a hard block, and a 4xx would tell
 * clients otherwise.
 */

import type { FastifyInstance } from 'fastify';
import type { Services } from '../services';
import { tenthsToPercentage } from '../../shared/util/tenths';
import type { CreateAssignmentResult } from '../assignment/assignment-component';
import {
  asOfQuerySchema,
  assignmentCreateSchema,
  assignmentEndSchema,
  assignmentQuerySchema,
  assignmentUpdateSchema,
  idParamSchema,
} from './schemas';
import { identityOf } from './session-middleware';

/**
 * Presents a result from C-03, converting tenths to percentages at the boundary.
 *
 * This is the ONLY place allocation tenths become decimals in the assignment API. Doing it
 * per-route would eventually produce two conventions.
 */
function present(result: CreateAssignmentResult): Record<string, unknown> {
  return {
    assignment: result.assignment,
    savedAsOverride: result.savedAsOverride,
    // Non-empty means step one raised a warning.
    requiresOverrideConfirmation: result.assignment === null && result.overAllocation.length > 0,
    overAllocation: result.overAllocation.map((finding) => ({
      memberId: finding.memberId,
      period: finding.period,
      totalPercentage: tenthsToPercentage(finding.totalTenths),
      arisesFromOverride: finding.arisesFromOverride,
      contributions: finding.contributions.map((contribution) => ({
        assignmentId: contribution.assignmentId,
        projectId: contribution.projectId,
        projectName: contribution.projectName,
        projectCode: contribution.projectCode,
        allocationPercentage: tenthsToPercentage(contribution.allocationTenths),
        savedAsOverride: contribution.savedAsOverride,
      })),
    })),
    // BR-A-13/14 warnings, which never block.
    conflicts: result.conflicts,
  };
}

export function registerAssignmentRoutes(app: FastifyInstance, services: Services): void {
  /**
   * GET /api/assignments — US-ASN-02.
   *
   * With no memberId or projectId, returns the CALLER's own assignments. That default is what
   * makes the route useful to a TEAM_MEMBER without them having to know their member id.
   */
  app.get('/api/assignments', async (request, reply) => {
    const query = assignmentQuerySchema.parse(request.query);
    const identity = identityOf(request);
    const range =
      query.start !== null && query.end !== null
        ? { start: query.start, end: query.end }
        : null;

    if (query.projectId !== null) {
      const items = await services.assignments.findByProject(query.projectId, range, identity);
      return reply.send({ items });
    }

    if (query.memberId !== null) {
      const items = await services.assignments.findByMember(query.memberId, range, identity);
      return reply.send({ items });
    }

    const items = await services.assignments.findOwn(range, identity);
    return reply.send({ items });
  });

  /**
   * GET /api/assignments/as-of — US-ASN-07.
   *
   * BR-A-22 Path B: resolved against AssignmentHistory, never current rows. The response says
   * so explicitly, because a client showing historical figures must be able to label them as
   * reconstructed rather than current.
   */
  app.get('/api/assignments/as-of', async (request, reply) => {
    const query = asOfQuerySchema.parse(request.query);

    const revisions = await services.assignments.findAsOf(
      query.memberIds ?? [],
      { start: query.start, end: query.end },
      query.asOf,
      identityOf(request),
    );

    return reply.send({
      asOf: query.asOf,
      source: 'ASSIGNMENT_HISTORY',
      items: revisions.map((revision) => ({
        assignmentId: revision.assignmentId,
        revisionNumber: revision.revisionNumber,
        operation: revision.operation,
        memberId: revision.memberId,
        projectId: revision.projectId,
        allocationPercentage: tenthsToPercentage(revision.allocationTenths),
        startDate: revision.startDate,
        endDate: revision.endDate,
        savedAsOverride: revision.savedAsOverride,
        status: revision.status,
        recordedAt: revision.recordedAt.toISOString(),
      })),
    });
  });

  /** GET /api/assignments/:id. */
  app.get('/api/assignments/:id', async (request, reply) => {
    const { id } = idParamSchema.parse(request.params);
    const assignment = await services.assignments.getById(id, identityOf(request));
    return reply.send(assignment);
  });

  /** POST /api/assignments — US-ASN-01, 05, 06. See the two-step protocol above. */
  app.post('/api/assignments', async (request, reply) => {
    const body = assignmentCreateSchema.parse(request.body);
    const { overrideOverAllocation, ...input } = body;

    const result = await services.assignments.create(
      input,
      overrideOverAllocation,
      identityOf(request),
    );

    // 200 for the warning (nothing written), 201 for a real creation.
    const status = result.assignment === null ? 200 : 201;
    return reply.code(status).send(present(result));
  });

  /** PATCH /api/assignments/:id — US-ASN-03, 05. Same two-step protocol. */
  app.patch('/api/assignments/:id', async (request, reply) => {
    const { id } = idParamSchema.parse(request.params);
    const body = assignmentUpdateSchema.parse(request.body);
    const { overrideOverAllocation, ...input } = body;

    const result = await services.assignments.update(
      id,
      input,
      overrideOverAllocation,
      identityOf(request),
    );
    return reply.send(present(result));
  });

  /** POST /api/assignments/:id/end — US-ASN-03. */
  app.post('/api/assignments/:id/end', async (request, reply) => {
    const { id } = idParamSchema.parse(request.params);
    const { effectiveEndDate } = assignmentEndSchema.parse(request.body);

    const assignment = await services.assignments.endEarly(
      id,
      effectiveEndDate,
      identityOf(request),
    );
    return reply.send(assignment);
  });
}
