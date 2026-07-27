/**
 * Project routes — US-PRJ-01…05.
 */

import type { FastifyInstance } from 'fastify';
import type { Services } from '../services';
import {
  idParamSchema,
  projectCloseSchema,
  projectCreateSchema,
  projectSearchSchema,
  projectUpdateSchema,
  staffingQuerySchema,
} from './schemas';
import { identityOf } from './session-middleware';

export function registerProjectRoutes(app: FastifyInstance, services: Services): void {
  /** GET /api/projects — US-PRJ-03. */
  app.get('/api/projects', async (request, reply) => {
    const query = projectSearchSchema.parse(request.query);
    const page = await services.projects.search(query, identityOf(request));
    return reply.send(page);
  });

  /** GET /api/projects/open — assignment targets only (BR-P-08 excludes closed). */
  app.get('/api/projects/open', async (request, reply) => {
    const onDate =
      (request.query as { onDate?: string }).onDate ?? new Date().toISOString().slice(0, 10);
    const projects = await services.projects.listOpen(onDate, identityOf(request));
    return reply.send({ items: projects, onDate });
  });

  /** GET /api/projects/:id. */
  app.get('/api/projects/:id', async (request, reply) => {
    const { id } = idParamSchema.parse(request.params);
    const project = await services.projects.getById(id, identityOf(request));
    return reply.send(project);
  });

  /**
   * GET /api/projects/:id/staffing — US-PRJ-04.
   *
   * `isUnstaffed` is sent explicitly (BR-P-09) rather than left for the client to infer from
   * empty arrays: "no assignments at all" and "none current" are different facts, and only
   * the server can tell them apart.
   */
  app.get('/api/projects/:id/staffing', async (request, reply) => {
    const { id } = idParamSchema.parse(request.params);
    const { asOf } = staffingQuerySchema.parse(request.query);
    const staffing = await services.projects.getStaffing(id, asOf, identityOf(request));
    return reply.send(staffing);
  });

  /** POST /api/projects — US-PRJ-01, US-PRJ-05. */
  app.post('/api/projects', async (request, reply) => {
    const input = projectCreateSchema.parse(request.body);
    const project = await services.projects.create(input, identityOf(request));
    return reply.code(201).send(project);
  });

  /** PATCH /api/projects/:id — US-PRJ-01. */
  app.patch('/api/projects/:id', async (request, reply) => {
    const { id } = idParamSchema.parse(request.params);
    const input = projectUpdateSchema.parse(request.body);
    const project = await services.projects.update(id, input, identityOf(request));
    return reply.send(project);
  });

  /**
   * POST /api/projects/:id/close — US-PRJ-02, BR-P-06/07.
   *
   * TWO-PHASE. Without `confirmOpenAssignments`, a project with assignments extending past the
   * closure date returns **200 with `confirmationRequired: true`** and writes NOTHING — the
   * response lists exactly whose work would be ended.
   *
   * 200 rather than 409 is deliberate: this is a successful preview, not a failure. A 409
   * would push clients toward error handling for what is a normal step in the flow.
   */
  app.post('/api/projects/:id/close', async (request, reply) => {
    const { id } = idParamSchema.parse(request.params);
    const { confirmOpenAssignments } = projectCloseSchema.parse(request.body ?? {});

    const result = await services.projects.close(
      id,
      confirmOpenAssignments,
      identityOf(request),
    );
    return reply.send(result);
  });

  /** POST /api/projects/:id/reopen. Auto-ended assignments are NOT restored. */
  app.post('/api/projects/:id/reopen', async (request, reply) => {
    const { id } = idParamSchema.parse(request.params);
    const project = await services.projects.reopen(id, identityOf(request));
    return reply.send({ project, assignmentsRestored: false });
  });
}
