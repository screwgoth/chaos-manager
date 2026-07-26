/**
 * Allocation view routes — US-VIS-01, 02, 03, 06.
 *
 * TENTHS BECOME PERCENTAGES HERE and only here. The domain works exclusively in integer
 * tenths (BR-A-03); the wire format uses decimals because that is what a UI displays. Doing
 * the conversion at the boundary means no domain code is tempted into float arithmetic and no
 * two routes invent different conventions.
 *
 * `availablePercentage` may be NEGATIVE (BR-V-03). It is deliberately not clamped at zero —
 * "0% available" and "-20% available" mean very different things to whoever is staffing a
 * project, and clamping would hide every over-allocation from the availability view.
 */

import type { FastifyInstance } from 'fastify';
import type { AllocationSegment, OverAllocationFinding } from '../../shared/types/domain';
import { percentageToTenths, tenthsToPercentage } from '../../shared/util/tenths';
import type { AllocationViewCriteria } from '../services';
import type { Services } from '../services';
import { allocationViewSchema, availabilitySchema, idParamSchema, rangeQuerySchema } from './schemas';
import { identityOf } from './session-middleware';

function presentSegment(segment: AllocationSegment): Record<string, unknown> {
  return {
    period: segment.period,
    totalPercentage: tenthsToPercentage(segment.totalTenths),
    availablePercentage: tenthsToPercentage(segment.availableTenths),
    isOverAllocated: segment.isOverAllocated,
    contributions: segment.contributions.map((contribution) => ({
      assignmentId: contribution.assignmentId,
      projectId: contribution.projectId,
      projectName: contribution.projectName,
      projectCode: contribution.projectCode,
      allocationPercentage: tenthsToPercentage(contribution.allocationTenths),
      savedAsOverride: contribution.savedAsOverride,
    })),
  };
}

function presentFinding(finding: OverAllocationFinding): Record<string, unknown> {
  return {
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
  };
}

export function registerAllocationRoutes(app: FastifyInstance, services: Services): void {
  /** GET /api/allocations/current — US-VIS-01. */
  app.get('/api/allocations/current', async (request, reply) => {
    const query = allocationViewSchema.parse(request.query);
    const criteria: Partial<AllocationViewCriteria> = {
      orgUnitIds: query.orgUnitIds,
      employmentType: query.employmentType,
      roleId: query.roleId,
      skillIds: query.skillIds,
      offset: query.offset,
      limit: query.limit,
    };

    const page = await services.allocations.currentAllocationView(
      query.asOf,
      criteria,
      identityOf(request),
    );

    return reply.send({
      asOf: query.asOf,
      total: page.total,
      offset: page.offset,
      limit: page.limit,
      items: page.items.map((row) => ({
        member: row.member,
        totalPercentage: tenthsToPercentage(row.totalTenths),
        availablePercentage: tenthsToPercentage(row.availableTenths),
        isOverAllocated: row.isOverAllocated,
        contributions: row.contributions.map((contribution) => ({
          assignmentId: contribution.assignmentId,
          projectId: contribution.projectId,
          projectName: contribution.projectName,
          projectCode: contribution.projectCode,
          allocationPercentage: tenthsToPercentage(contribution.allocationTenths),
          savedAsOverride: contribution.savedAsOverride,
        })),
      })),
    });
  });

  /** GET /api/allocations/availability — US-VIS-02, US-VIS-03. */
  app.get('/api/allocations/availability', async (request, reply) => {
    const query = availabilitySchema.parse(request.query);
    const range = { start: query.start, end: query.end };

    const page = await services.allocations.availability(
      {
        range,
        orgUnitIds: query.orgUnitIds,
        employmentType: query.employmentType,
        roleId: query.roleId,
        skillIds: query.skillIds,
        offset: query.offset,
        limit: query.limit,
        minimumAvailableTenths:
          query.minimumAvailablePercentage === undefined
            ? null
            : percentageToTenths(query.minimumAvailablePercentage),
      },
      identityOf(request),
    );

    return reply.send({
      range,
      total: page.total,
      offset: page.offset,
      limit: page.limit,
      items: page.items.map((result) => ({
        member: result.member,
        // Both bounds, because they answer different questions: the minimum says whether the
        // member can take a full-range assignment, the maximum whether any window exists.
        minAvailablePercentage: tenthsToPercentage(result.minAvailableTenths),
        maxAvailablePercentage: tenthsToPercentage(result.maxAvailableTenths),
        isFullyAllocated: result.isFullyAllocated,
        isOverAllocated: result.isOverAllocated,
        segments: result.segments.map(presentSegment),
      })),
    });
  });

  /** GET /api/allocations/over-allocated — US-VIS-03. One entry per offending sub-period. */
  app.get('/api/allocations/over-allocated', async (request, reply) => {
    const query = rangeQuerySchema.parse(request.query);
    const range = { start: query.start, end: query.end };

    const findings = await services.allocations.overAllocated(range, {}, identityOf(request));
    return reply.send({ range, items: findings.map(presentFinding) });
  });

  /** GET /api/allocations/unallocated — US-VIS-06. The bench. */
  app.get('/api/allocations/unallocated', async (request, reply) => {
    const query = rangeQuerySchema.parse(request.query);
    const range = { start: query.start, end: query.end };

    const members = await services.allocations.unallocated(range, identityOf(request));
    return reply.send({ range, items: members });
  });

  /** GET /api/allocations/members/:id/timeline — one member over time, gaps marked. */
  app.get('/api/allocations/members/:id/timeline', async (request, reply) => {
    const { id } = idParamSchema.parse(request.params);
    const query = rangeQuerySchema.parse(request.query);
    const range = { start: query.start, end: query.end };

    const timeline = await services.allocations.memberTimeline(id, range, identityOf(request));
    return reply.send({
      memberId: id,
      range,
      items: timeline.map((segment) => ({
        period: segment.period,
        totalPercentage: tenthsToPercentage(segment.totalTenths),
        availablePercentage: tenthsToPercentage(segment.availableTenths),
        isOverAllocated: segment.isOverAllocated,
        // Distinguishes "nothing booked" from "partially booked" — a UI must not render
        // them alike, or an idle month looks busy.
        isGap: segment.isGap,
        assignments: segment.assignments.map((contribution) => ({
          assignmentId: contribution.assignmentId,
          projectId: contribution.projectId,
          projectName: contribution.projectName,
          projectCode: contribution.projectCode,
          allocationPercentage: tenthsToPercentage(contribution.allocationTenths),
          savedAsOverride: contribution.savedAsOverride,
        })),
      })),
    });
  });

  /** GET /api/allocations/members/:id — the segment profile behind the views. */
  app.get('/api/allocations/members/:id', async (request, reply) => {
    const { id } = idParamSchema.parse(request.params);
    const query = rangeQuerySchema.parse(request.query);
    const range = { start: query.start, end: query.end };

    const segments = await services.allocations.profile(id, range, identityOf(request));
    return reply.send({ memberId: id, range, items: segments.map(presentSegment) });
  });
}
