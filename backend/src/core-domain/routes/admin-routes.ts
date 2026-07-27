/**
 * Reference data and org unit routes — US-ADM-01, 02, 03.
 *
 * BR-C-06 and BR-O-05 both REFUSE removal of a referenced record and report what blocks it.
 * Those refusals come back as **200 with `removed: false`**, not 409: the caller asked "can
 * this go?", the answer is "no, and here is why", and that is a successful answer to a
 * reasonable question. A 409 would push clients into error handling for the normal case where
 * an admin is checking before acting.
 */

import type { FastifyInstance } from 'fastify';
import type { Services } from '../services';
import {
  idParamSchema,
  includeInactiveSchema,
  orgUnitCreateSchema,
  orgUnitUpdateSchema,
  referenceCreateSchema,
  referenceListSchema,
  referenceRenameSchema,
} from './schemas';
import { identityOf } from './session-middleware';

export function registerAdminRoutes(app: FastifyInstance, services: Services): void {
  // --- reference data (US-ADM-01, US-ADM-02) -------------------------------

  /**
   * GET /api/reference-data?type=ROLE.
   *
   * Readable by ANY authenticated user, deliberately: the role and skill lists populate every
   * member form, so a TEAM_LEAD who could not read them could not render a member page at
   * all. Writes still require ADMIN or RESOURCE_MANAGER (BR-R-01).
   */
  app.get('/api/reference-data', async (request, reply) => {
    const query = referenceListSchema.parse(request.query);
    const items = await services.referenceData.list(
      query.type,
      query.includeInactive,
      identityOf(request),
    );
    return reply.send({ referenceType: query.type, items });
  });

  /** POST /api/reference-data — US-ADM-01. Immediately selectable (BR-C-02). */
  app.post('/api/reference-data', async (request, reply) => {
    const input = referenceCreateSchema.parse(request.body);
    const entry = await services.referenceData.create(
      input.referenceType,
      input.name,
      identityOf(request),
    );
    return reply.code(201).send(entry);
  });

  /** PATCH /api/reference-data/:id — BR-C-04: propagates by identifier, no cascade needed. */
  app.patch('/api/reference-data/:id', async (request, reply) => {
    const { id } = idParamSchema.parse(request.params);
    const { name } = referenceRenameSchema.parse(request.body);
    const entry = await services.referenceData.rename(id, name, identityOf(request));
    return reply.send(entry);
  });

  /** POST /api/reference-data/:id/deactivate — US-ADM-02. Existing references stay valid. */
  app.post('/api/reference-data/:id/deactivate', async (request, reply) => {
    const { id } = idParamSchema.parse(request.params);
    const identity = identityOf(request);

    const entry = await services.referenceData.deactivate(id, identity);
    // The count is informational (BR-C-06 keeps those references working) but an admin should
    // still see how much is affected.
    const references = await services.referenceData.countReferences(id, identity);
    return reply.send({ entry, existingReferences: references });
  });

  /** POST /api/reference-data/:id/reactivate — BR-C-07. */
  app.post('/api/reference-data/:id/reactivate', async (request, reply) => {
    const { id } = idParamSchema.parse(request.params);
    const entry = await services.referenceData.reactivate(id, identityOf(request));
    return reply.send(entry);
  });

  /**
   * DELETE /api/reference-data/:id — BR-C-06.
   *
   * Refused while referenced, with the count, and the response points at deactivation as the
   * alternative. Unreferenced entries really are deleted — an admin who created a typo should
   * be able to remove it rather than leave a deactivated mistake in the list forever.
   */
  app.delete('/api/reference-data/:id', async (request, reply) => {
    const { id } = idParamSchema.parse(request.params);
    const result = await services.referenceData.remove(id, identityOf(request));

    return reply.send({
      removed: result.removed,
      blockedByReferenceCount: result.blockedBy,
      alternative: result.removed ? null : 'DEACTIVATE',
    });
  });

  // --- org units (US-ADM-03) ----------------------------------------------

  /** GET /api/org-units — the flat list. */
  app.get('/api/org-units', async (request, reply) => {
    const { includeInactive } = includeInactiveSchema.parse(request.query);
    const items = await services.orgUnits.listAll(includeInactive, identityOf(request));
    return reply.send({ items });
  });

  /** GET /api/org-units/hierarchy — the two-level tree, from one flat fetch. */
  app.get('/api/org-units/hierarchy', async (request, reply) => {
    const { includeInactive } = includeInactiveSchema.parse(request.query);
    const items = await services.orgUnits.listHierarchy(includeInactive, identityOf(request));
    return reply.send({ items });
  });

  /** POST /api/org-units — BR-O-01: two levels only, and the refusal names the parent. */
  app.post('/api/org-units', async (request, reply) => {
    const input = orgUnitCreateSchema.parse(request.body);
    const orgUnit = await services.orgUnits.create(input, identityOf(request));
    return reply.code(201).send(orgUnit);
  });

  /**
   * PATCH /api/org-units/:id — rename only.
   *
   * Reparenting is refused by the domain (it would silently change who can see the members and
   * the scope historical allocations were computed under), so the schema accepts only a name.
   */
  app.patch('/api/org-units/:id', async (request, reply) => {
    const { id } = idParamSchema.parse(request.params);
    const input = orgUnitUpdateSchema.parse(request.body);
    const orgUnit = await services.orgUnits.update(id, input, identityOf(request));
    return reply.send(orgUnit);
  });

  /** GET /api/org-units/:id/references — what would block removal (BR-O-05). */
  app.get('/api/org-units/:id/references', async (request, reply) => {
    const { id } = idParamSchema.parse(request.params);
    const counts = await services.orgUnits.countReferences(id, identityOf(request));
    return reply.send(counts);
  });

  /** DELETE /api/org-units/:id — BR-O-05, refused while referenced. */
  app.delete('/api/org-units/:id', async (request, reply) => {
    const { id } = idParamSchema.parse(request.params);
    const result = await services.orgUnits.remove(id, identityOf(request));

    return reply.send({
      removed: result.removed,
      blockedBy: result.blockedBy,
      alternative: result.removed ? null : 'DEACTIVATE',
    });
  });

  /** POST /api/org-units/:id/deactivate. Refused while the unit still has teams. */
  app.post('/api/org-units/:id/deactivate', async (request, reply) => {
    const { id } = idParamSchema.parse(request.params);
    const orgUnit = await services.orgUnits.deactivate(id, identityOf(request));
    return reply.send(orgUnit);
  });

  /** POST /api/org-units/:id/reactivate. */
  app.post('/api/org-units/:id/reactivate', async (request, reply) => {
    const { id } = idParamSchema.parse(request.params);
    const orgUnit = await services.orgUnits.reactivate(id, identityOf(request));
    return reply.send(orgUnit);
  });
}
