/**
 * Member routes — US-MEM-01…07, US-VIS-04.
 *
 * Note the ORDER of the `/api/members/me` and `/api/members/expiring-contracts` registrations
 * relative to `/api/members/:id`. Fastify's router is not order-sensitive for static-vs-param
 * segments, but the intent is worth stating: `me` and `expiring-contracts` are NOT ids, and
 * `:id` must never swallow them.
 */

import type { FastifyInstance } from 'fastify';
import type { Services } from '../services';
import {
  expiringContractsSchema,
  idParamSchema,
  memberCreateSchema,
  memberSearchSchema,
  memberUpdateSchema,
  skillParamSchema,
} from './schemas';
import { identityOf } from './session-middleware';

export function registerMemberRoutes(app: FastifyInstance, services: Services): void {
  /** GET /api/members — US-MEM-04. Scope applied inside the query (FR-R-08). */
  app.get('/api/members', async (request, reply) => {
    const query = memberSearchSchema.parse(request.query);
    const page = await services.members.search(query, identityOf(request));
    return reply.send(page);
  });

  /**
   * GET /api/members/me — US-VIS-04.
   *
   * Resolves through the session's `ownMemberId`. There is deliberately no way to pass an id
   * here: this is the route a TEAM_MEMBER uses, and it must be incapable of returning anyone
   * else's record.
   */
  app.get('/api/members/me', async (request, reply) => {
    const member = await services.members.getOwn(identityOf(request));
    return reply.send(member);
  });

  /** GET /api/members/expiring-contracts — US-MEM-06. */
  app.get('/api/members/expiring-contracts', async (request, reply) => {
    const { withinDays } = expiringContractsSchema.parse(request.query);
    const members = await services.members.findExpiringContracts(
      withinDays,
      identityOf(request),
    );
    return reply.send({ items: members, withinDays });
  });

  /** GET /api/members/assignable — the picker for the assignment form. */
  app.get('/api/members/assignable', async (request, reply) => {
    const { onDate } = { onDate: (request.query as { onDate?: string }).onDate };
    const members = await services.members.listAssignable(
      onDate ?? new Date().toISOString().slice(0, 10),
      identityOf(request),
    );
    return reply.send({ items: members });
  });

  /**
   * GET /api/members/:id.
   *
   * An out-of-scope member yields 404, not 403 — "forbidden" would confirm the record exists,
   * leaking exactly what the scope filter hides.
   */
  app.get('/api/members/:id', async (request, reply) => {
    const { id } = idParamSchema.parse(request.params);
    const member = await services.members.getById(id, identityOf(request));
    return reply.send(member);
  });

  /** POST /api/members — US-MEM-01, US-MEM-07. */
  app.post('/api/members', async (request, reply) => {
    const input = memberCreateSchema.parse(request.body);
    const member = await services.members.create(input, identityOf(request));
    return reply.code(201).send(member);
  });

  /** PATCH /api/members/:id — US-MEM-01, US-MEM-02, US-MEM-03. */
  app.patch('/api/members/:id', async (request, reply) => {
    const { id } = idParamSchema.parse(request.params);
    const input = memberUpdateSchema.parse(request.body);
    const member = await services.members.update(id, input, identityOf(request));
    return reply.send(member);
  });

  /**
   * POST /api/members/:id/deactivate — US-MEM-05.
   *
   * Returns the auto-ended assignment count (BR-M-13) so the UI can report it. A silent
   * cascade would change other people's project plans without saying so.
   */
  app.post('/api/members/:id/deactivate', async (request, reply) => {
    const { id } = idParamSchema.parse(request.params);
    const result = await services.members.deactivate(id, identityOf(request));
    return reply.send({
      member: result.member,
      autoEndedAssignmentCount: result.autoEndedAssignmentCount,
    });
  });

  /** POST /api/members/:id/reactivate. BR-M-15: auto-ended assignments are NOT restored. */
  app.post('/api/members/:id/reactivate', async (request, reply) => {
    const { id } = idParamSchema.parse(request.params);
    const member = await services.members.reactivate(id, identityOf(request));
    return reply.send({ member, assignmentsRestored: false });
  });

  /** POST /api/members/:id/skills — US-MEM-03. */
  app.post('/api/members/:id/skills', async (request, reply) => {
    const { id } = idParamSchema.parse(request.params);
    const { skillId } = skillParamSchema.parse(request.body);
    const member = await services.members.attachSkill(id, skillId, identityOf(request));
    return reply.send(member);
  });

  /** DELETE /api/members/:id/skills/:skillId — BR-M-12: other skills untouched. */
  app.delete('/api/members/:id/skills/:skillId', async (request, reply) => {
    const { id } = idParamSchema.parse(request.params);
    const { skillId } = skillParamSchema.parse(request.params);
    const member = await services.members.detachSkill(id, skillId, identityOf(request));
    return reply.send(member);
  });
}
