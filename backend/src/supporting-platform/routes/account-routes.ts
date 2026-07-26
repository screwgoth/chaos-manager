/**
 * Account-to-member linkage endpoints — US-ACC-04.
 *
 * ADMIN ONLY (BR-L-06), enforced in the service via the permission matrix, not by hiding the
 * route. A non-admin reaching these gets 403 from `requireWrite`.
 *
 * REFUSALS CARRY A MACHINE-READABLE REASON (`ACCOUNT_ALREADY_LINKED` / `MEMBER_ALREADY_LINKED`)
 * alongside the human message, so a non-browser client can branch on the code rather than
 * matching prose — the client-agnostic API property Unit 2 must uphold (US-ENB-04, R2 obligation
 * 5). `ConflictError.detail` carries it through the error mapper unchanged.
 */

import { z } from 'zod';
import type { FastifyInstance } from 'fastify';
import type { AccountLinkService } from '../accounts/account-link-service';
import { identityOf } from '../../core-domain/routes/session-middleware';
import type { MemberId, UserAccountId } from '../../shared/types/domain';

const accountIdParamSchema = z.object({ id: z.string().min(1) });
const linkBodySchema = z.object({ memberId: z.string().uuid() });
const listQuerySchema = z.object({
  includeInactive: z
    .enum(['true', 'false'])
    .optional()
    .transform((value) => value === 'true'),
});

export function registerAccountRoutes(app: FastifyInstance, accountLinks: AccountLinkService): void {
  /** GET /api/accounts — the admin linkage screen. */
  app.get('/api/accounts', async (request, reply) => {
    const query = listQuerySchema.parse(request.query);
    const items = await accountLinks.list(query.includeInactive, identityOf(request));
    return reply.send({ items });
  });

  /** POST /api/accounts/:id/link — US-ACC-04. Idempotent when already linked to the same member. */
  app.post('/api/accounts/:id/link', async (request, reply) => {
    const { id } = accountIdParamSchema.parse(request.params);
    const { memberId } = linkBodySchema.parse(request.body);
    const account = await accountLinks.link(
      id as UserAccountId,
      memberId as MemberId,
      identityOf(request),
    );
    return reply.send({
      id: account.id,
      username: account.username,
      linkedMemberId: account.linkedMemberId,
    });
  });

  /**
   * DELETE /api/accounts/:id/link — BR-L-04.
   *
   * ⚠️ For a TEAM_MEMBER this revokes ALL access (BR-R-18). The response echoes the role so a
   * client can say so without a second lookup.
   */
  app.delete('/api/accounts/:id/link', async (request, reply) => {
    const { id } = accountIdParamSchema.parse(request.params);
    const account = await accountLinks.unlink(id as UserAccountId, identityOf(request));
    return reply.send({
      id: account.id,
      username: account.username,
      role: account.role,
      linkedMemberId: account.linkedMemberId,
      // Explicit rather than left for the client to infer from role + null link.
      accessRevoked: account.role === 'TEAM_MEMBER',
    });
  });
}
