/**
 * Import endpoints — US-IMP-01..05.
 *
 * ADMIN ONLY (BR-IM-22). Enforced by `requireWrite(IMPORT)` before the file is even read, so a
 * non-admin upload is refused without the server parsing 5 MB of their CSV.
 *
 * STATUS CODES, and why a fruitless import is 200:
 *
 *   | Situation                          | Outcome          | HTTP |
 *   |------------------------------------|------------------|------|
 *   | rows written                       | CREATED          | 200  |
 *   | every row failed or conflicted     | NOTHING_CREATED  | 200  |
 *   | bad format / missing column / size | FILE_REFUSED     | 400  |
 *   | non-admin                          | —                | 403  |
 *
 * A processed-but-fruitless import is **200, not 4xx**: the request was well-formed and the answer
 * is a report. Returning 4xx would make the client treat a legitimate result as a protocol failure
 * and discard the very report the admin needs to fix their file.
 *
 * BR-IM-24: every log line here carries COUNTS AND REASONS ONLY. No name, email, external
 * reference or vendor may appear — imported rows are personal data, and the container log is
 * rotated but not access-controlled.
 */

import { z } from 'zod';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { AccessControlService } from '../../core-domain/services';
import { identityOf } from '../../core-domain/routes/session-middleware';
import { templateCsv, type ImportKind } from '../import/column-contracts';
import type { ImportComponent } from '../import/import-component';
import type { ImportResult } from '../import/import-types';

const templateParamSchema = z.object({ kind: z.enum(['members', 'projects']) });

export interface ImportRouteOptions {
  imports: ImportComponent;
  accessControl: AccessControlService;
  maxBytes: number;
}

export function registerImportRoutes(app: FastifyInstance, options: ImportRouteOptions): void {
  const { imports, accessControl, maxBytes } = options;

  /**
   * GET /api/imports/template/:kind — US-IMP-05.
   *
   * Generated from the SAME column contract the parser uses (BR-IM-26), so the template cannot
   * drift from what the upload accepts. Readable by any signed-in user: knowing the column names
   * reveals nothing, and refusing it would make the admin screen need a second permission check
   * for no gain.
   */
  app.get('/api/imports/template/:kind', async (request, reply) => {
    const { kind } = templateParamSchema.parse(request.params);
    const importKind: ImportKind = kind === 'members' ? 'MEMBER' : 'PROJECT';
    return reply
      .header('content-type', 'text/csv; charset=utf-8')
      .header('content-disposition', `attachment; filename="chaos-${kind}-template.csv"`)
      .send(templateCsv(importKind));
  });

  const handler =
    (kind: ImportKind) =>
    async function importHandler(request: FastifyRequest, reply: FastifyReply) {
      // BR-IM-22 FIRST: refuse before touching the upload at all.
      const scope = accessControl.scopeFor(identityOf(request));
      accessControl.requireWrite(scope, 'IMPORT');

      const file = await request.file();
      if (file === undefined) {
        return reply.code(400).send({
          error: {
            code: 'VALIDATION_FAILED',
            message: 'No file was uploaded. Attach a .csv file as the "file" field.',
            violations: [{ field: 'file', rule: 'REQUIRED', detail: 'A CSV file is required.' }],
          },
        });
      }

      // BR-IM-25: buffered in memory, never written to disk. Nothing to clean up after a crash.
      const content = await file.toBuffer();

      request.log.info(
        { importKind: kind, bytes: content.byteLength },
        'import received',
      );

      const result: ImportResult =
        kind === 'MEMBER'
          ? await imports.importMembers(file.filename, content)
          : await imports.importProjects(file.filename, content);

      // BR-IM-24: counts and reasons only. `refusalReason` is about the FILE, never a row.
      request.log.info(
        {
          importKind: kind,
          outcome: result.outcome,
          totalRows: result.totalRows,
          created: result.created,
          failedRows: result.failed.length,
          conflictRows: result.conflicts.length,
          ignoredColumns: result.ignoredColumns.length,
        },
        'import complete',
      );

      const status = result.outcome === 'FILE_REFUSED' ? 400 : 200;
      return reply.code(status).send(result);
    };

  /**
   * POST /api/imports/members and /api/imports/projects — US-IMP-01, US-IMP-02.
   *
   * N-Q4:A: the 5 MB `bodyLimit` is set PER ROUTE. Every other endpoint keeps Fastify's 1 MB
   * default — a 5 MB limit on the sign-in endpoint would serve no purpose.
   */
  app.post('/api/imports/members', { bodyLimit: maxBytes }, handler('MEMBER'));
  app.post('/api/imports/projects', { bodyLimit: maxBytes }, handler('PROJECT'));
}
