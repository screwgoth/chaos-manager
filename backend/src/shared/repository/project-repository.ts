/**
 * Project persistence. Scope is enforced on `owning_org_unit_id`, the project's
 * equivalent of a member's org unit (FR-R-08).
 */

import type { Expression, ExpressionBuilder, SqlBool } from 'kysely';
import type { DbOrTx } from './db';
import { permittedOrgUnitIds } from './db';
import type { Database } from './schema';
import type { ScopeFilter } from '../types/authorization';
import type {
  IsoDate,
  OrgUnitId,
  Page,
  Project,
  ProjectId,
  ProjectStatus,
  ProjectSummary,
  ReferenceId,
} from '../types/domain';
import { toProject, toProjectSummary } from './mappers';
import { withPgErrors } from './pg-errors';

type ProjectEb = ExpressionBuilder<Database, 'project'>;
type ProjectPredicate = (eb: ProjectEb) => Expression<SqlBool>;

export interface ProjectWrite {
  code: string;
  name: string;
  description: string | null;
  owningOrgUnitId: OrgUnitId;
  projectTypeId: ReferenceId;
  startDate: IsoDate;
  plannedEndDate: IsoDate;
}

export interface ProjectQuery {
  search: string | null;
  orgUnitIds: OrgUnitId[] | null;
  projectTypeId: ReferenceId | null;
  status: ProjectStatus | null;
  offset: number;
  limit: number;
}

/**
 * Project scope.
 *
 * NOTE the deliberate asymmetry with members: `restrictToMemberId` does NOT filter
 * projects by owning org unit. A TEAM_MEMBER must be able to see the projects they are
 * assigned to even when those projects belong to another org unit — otherwise their own
 * assignment list would render with unresolvable project names. Restricting the
 * project's own org unit here would break that, so own-data narrowing is applied via
 * `findByIdsForMember` instead, which limits projects to the ones the member is
 * actually assigned to.
 */
function scopePredicates(scope: ScopeFilter): ProjectPredicate[] {
  const orgIds = permittedOrgUnitIds(scope);
  if (orgIds === null) return [];
  return [
    orgIds.length === 0
      ? (eb) => eb.lit(false)
      : (eb) => eb('project.owning_org_unit_id', 'in', orgIds),
  ];
}

function filterPredicates(filters: ProjectQuery): ProjectPredicate[] {
  const predicates: ProjectPredicate[] = [];

  const search = filters.search?.trim();
  if (search !== undefined && search !== '') {
    const pattern = `%${search}%`; // bound as a parameter (U1-NFR-SE-06)
    predicates.push((eb) =>
      eb.or([eb('project.name', 'ilike', pattern), eb('project.code', 'ilike', pattern)]),
    );
  }

  const orgUnitIds = filters.orgUnitIds;
  if (orgUnitIds !== null && orgUnitIds.length > 0) {
    predicates.push((eb) => eb('project.owning_org_unit_id', 'in', orgUnitIds));
  }

  const projectTypeId = filters.projectTypeId;
  if (projectTypeId !== null) {
    predicates.push((eb) => eb('project.project_type_id', '=', projectTypeId));
  }

  const status = filters.status;
  if (status !== null) {
    predicates.push((eb) => eb('project.status', '=', status));
  }

  return predicates;
}

function combine(predicates: ProjectPredicate[]): ProjectPredicate {
  return (eb) => eb.and(predicates.map((predicate) => predicate(eb)));
}

export class ProjectRepository {
  constructor(private readonly db: DbOrTx) {}

  async findById(id: ProjectId, scope: ScopeFilter): Promise<Project | null> {
    const row = await this.db
      .selectFrom('project')
      .selectAll()
      .where('project.id', '=', id)
      .where(combine(scopePredicates(scope)))
      .executeTakeFirst();
    return row ? toProject(row) : null;
  }

  /** Unscoped location lookup, for authorization decisions and assignment validation. */
  async findLocation(
    id: ProjectId,
  ): Promise<{
    id: ProjectId;
    owningOrgUnitId: OrgUnitId;
    status: ProjectStatus;
    startDate: IsoDate;
    plannedEndDate: IsoDate;
    closedOn: IsoDate | null;
  } | null> {
    const row = await this.db
      .selectFrom('project')
      .select([
        'id',
        'owning_org_unit_id',
        'status',
        'start_date',
        'planned_end_date',
        'closed_on',
      ])
      .where('id', '=', id)
      .executeTakeFirst();
    if (!row) return null;
    return {
      id: row.id,
      owningOrgUnitId: row.owning_org_unit_id,
      status: row.status,
      startDate: row.start_date,
      plannedEndDate: row.planned_end_date,
      closedOn: row.closed_on,
    };
  }

  async search(query: ProjectQuery, scope: ScopeFilter): Promise<Page<ProjectSummary>> {
    const predicate = combine([...scopePredicates(scope), ...filterPredicates(query)]);
    const base = this.db.selectFrom('project').where(predicate);

    const [countRow, rows] = await Promise.all([
      base.select((eb) => eb.fn.countAll<number>().as('count')).executeTakeFirstOrThrow(),
      base
        .selectAll('project')
        .orderBy('project.name', 'asc')
        .orderBy('project.id', 'asc') // stable paging
        .offset(query.offset)
        .limit(query.limit)
        .execute(),
    ]);

    return {
      items: rows.map(toProjectSummary),
      total: Number(countRow.count),
      offset: query.offset,
      limit: query.limit,
    };
  }

  /** Batched: resolve many project names/codes for an assignment list in one query. */
  async findByIds(ids: readonly ProjectId[]): Promise<Map<ProjectId, ProjectSummary>> {
    const result = new Map<ProjectId, ProjectSummary>();
    if (ids.length === 0) return result;

    const rows = await this.db
      .selectFrom('project')
      .selectAll()
      .where('id', 'in', [...ids])
      .execute();

    for (const row of rows) result.set(row.id, toProjectSummary(row));
    return result;
  }

  /**
   * Projects a specific member is assigned to, regardless of owning org unit.
   * This is the own-data path referenced in `scopePredicates` above.
   */
  async findForMember(memberId: string): Promise<ProjectSummary[]> {
    const rows = await this.db
      .selectFrom('project')
      .selectAll('project')
      .where((eb) =>
        eb.exists(
          eb
            .selectFrom('assignment')
            .select('assignment.id')
            .whereRef('assignment.project_id', '=', 'project.id')
            .where('assignment.member_id', '=', memberId),
        ),
      )
      .orderBy('project.name', 'asc')
      .execute();
    return rows.map(toProjectSummary);
  }

  async create(input: ProjectWrite): Promise<Project> {
    return withPgErrors(async () => {
      const row = await this.db
        .insertInto('project')
        .values({
          code: input.code,
          name: input.name,
          description: input.description,
          owning_org_unit_id: input.owningOrgUnitId,
          project_type_id: input.projectTypeId,
          start_date: input.startDate,
          planned_end_date: input.plannedEndDate,
        })
        .returningAll()
        .executeTakeFirstOrThrow();
      return toProject(row);
    });
  }

  async update(id: ProjectId, input: ProjectWrite): Promise<Project | null> {
    return withPgErrors(async () => {
      const row = await this.db
        .updateTable('project')
        .set({
          code: input.code,
          name: input.name,
          description: input.description,
          owning_org_unit_id: input.owningOrgUnitId,
          project_type_id: input.projectTypeId,
          start_date: input.startDate,
          planned_end_date: input.plannedEndDate,
          updated_at: new Date(),
        })
        .where('id', '=', id)
        .returningAll()
        .executeTakeFirst();
      return row ? toProject(row) : null;
    });
  }

  /** BR-P-06: closing records the date. Projects are never deleted. */
  async close(id: ProjectId, closedOn: IsoDate): Promise<Project | null> {
    const row = await this.db
      .updateTable('project')
      .set({ status: 'CLOSED', closed_on: closedOn, updated_at: new Date() })
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirst();
    return row ? toProject(row) : null;
  }

  async reopen(id: ProjectId): Promise<Project | null> {
    const row = await this.db
      .updateTable('project')
      .set({ status: 'ACTIVE', closed_on: null, updated_at: new Date() })
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirst();
    return row ? toProject(row) : null;
  }
}
