/**
 * C-10 Import — the five-phase pipeline from `business-logic-model.md` §5.
 *
 *   [1] FILE GATE      -> csv-reader.ts (format, size, rows, header)
 *   [2] PARSE          -> csv-reader.ts
 *   [3] VALIDATE       -> here, READ-ONLY, all reasons per row (BR-IM-11/12/13)
 *   [4] WRITE          -> here, ONE transaction, all valid rows (BR-IM-16)
 *   [5] REPORT         -> ImportResult, response only (BR-IM-19)
 *
 * TWO PROPERTIES THAT ARE EASY TO LOSE AND HARD TO NOTICE:
 *
 * 1. **Validation writes through Unit 1's components** (BR-IM-11). Import must NOT reimplement
 *    BR-M-* or BR-P-*, because a second copy drifts from the first and imported data then obeys
 *    different rules from hand-entered data. This is why phase 4 constructs a MemberComponent over
 *    the transaction rather than inserting rows itself.
 *
 * 2. **Reference lookups are batched ONCE per file** (BR-IM-14), not once per row. A 2,000-row
 *    file issues about four lookup queries. Per-row resolution is the textbook N+1 and would be
 *    slow enough in a synchronous request to look like a hang.
 */

import type { Db } from '../../shared/repository';
import {
  AssignmentRepository,
  AssignmentHistoryRepository,
  MemberRepository,
  OrgUnitRepository,
  ProjectRepository,
  ReferenceDataRepository,
  createRepositories,
} from '../../shared/repository';
import { AllocationComponent } from '../../core-domain/allocation/allocation-component';
import { AssignmentComponent } from '../../core-domain/assignment/assignment-component';
import { MemberComponent, type MemberInput } from '../../core-domain/member/member-component';
import { ProjectComponent, type ProjectInput } from '../../core-domain/project/project-component';
import { ReferenceDataComponent } from '../../core-domain/reference-data/reference-data-component';
import { AppError } from '../../shared/errors';
import type { ScopeFilter } from '../../shared/types/authorization';
import type {
  EmploymentType,
  IsoDate,
  OrgUnitId,
  ReferenceId,
} from '../../shared/types/domain';
import { SKILL_SEPARATOR, type ImportKind } from './column-contracts';
import { readCsv, type CsvLimits, type ParsedRow } from './csv-reader';
import type { ImportResult, RowConflict, RowFailure } from './import-types';

/** Name -> id maps, built once per file (BR-IM-14). */
interface Lookups {
  orgUnits: Map<string, OrgUnitId>;
  roles: Map<string, ReferenceId>;
  skills: Map<string, ReferenceId>;
  projectTypes: Map<string, ReferenceId>;
}

const UNRESTRICTED: ScopeFilter = { orgUnitIds: 'ALL', restrictToMemberId: null };
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** Case-insensitive key for every name lookup (BR-IM-13). */
function key(value: string): string {
  return value.trim().toLowerCase();
}

function get(row: ParsedRow, header: string): string {
  return (row.values[header] ?? '').trim();
}

/**
 * BR-IM-03 / AS-03: `YYYY-MM-DD` only. Locale formats are REFUSED, not guessed.
 *
 * `03/04/2026` is 3 April in most of the world and 4 March in the United States. Guessing
 * silently misreads dates for half the audience, and an allocation system that is wrong about
 * dates is worse than one that refuses the file.
 */
function invalidDate(value: string, field: string): string | null {
  if (!DATE_PATTERN.test(value)) {
    return `${field} must be written as YYYY-MM-DD (got "${value}").`;
  }
  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || !parsed.toISOString().startsWith(value)) {
    return `${field} is not a real date ("${value}").`;
  }
  return null;
}

interface PreparedMember {
  row: ParsedRow;
  input: MemberInput;
  naturalKey: string;
}

interface PreparedProject {
  row: ParsedRow;
  input: ProjectInput;
  naturalKey: string;
}

export class ImportComponent {
  constructor(
    private readonly db: Db,
    private readonly members: MemberRepository,
    private readonly projects: ProjectRepository,
    private readonly orgUnits: OrgUnitRepository,
    private readonly referenceData: ReferenceDataRepository,
    private readonly limits: CsvLimits,
  ) {}

  /**
   * Four queries, regardless of row count (BR-IM-14).
   *
   * Only ACTIVE entries are eligible: importing against a deactivated role would resurrect
   * vocabulary an admin deliberately retired (BR-C-04's spirit).
   */
  private async loadLookups(): Promise<Lookups> {
    const [orgUnits, roles, skills, projectTypes] = await Promise.all([
      this.orgUnits.findAll(false),
      this.referenceData.findByType('ROLE', false),
      this.referenceData.findByType('SKILL', false),
      this.referenceData.findByType('PROJECT_TYPE', false),
    ]);

    const toMap = <T extends { id: string; name: string }>(entries: T[]): Map<string, never> =>
      new Map(entries.map((entry) => [key(entry.name), entry.id])) as Map<string, never>;

    return {
      orgUnits: toMap(orgUnits),
      roles: toMap(roles),
      skills: toMap(skills),
      projectTypes: toMap(projectTypes),
    };
  }

  async importMembers(filename: string, content: Buffer): Promise<ImportResult> {
    const parsed = readCsv('MEMBER', filename, content, this.limits);
    if (!parsed.ok) return parsed.result;

    const lookups = await this.loadLookups();
    const failed: RowFailure[] = [];
    const prepared: PreparedMember[] = [];

    // --- phase 3: validate, read-only ---------------------------------------
    for (const row of parsed.rows) {
      const reasons: string[] = [];

      const fullName = get(row, 'full_name');
      const email = get(row, 'email');
      const externalRef = get(row, 'external_ref');
      const orgUnitName = get(row, 'org_unit');
      const employmentRaw = get(row, 'employment_type').toUpperCase();
      const roleName = get(row, 'role');
      const skillsRaw = get(row, 'skills');

      if (fullName === '') reasons.push('full_name is required.');
      if (email === '') reasons.push('email is required.');

      if (employmentRaw !== 'ON_ROLL' && employmentRaw !== 'OFF_ROLL') {
        reasons.push(`employment_type must be ON_ROLL or OFF_ROLL (got "${employmentRaw}").`);
      }

      // BR-IM-13: resolved by name, never created.
      const orgUnitId = lookups.orgUnits.get(key(orgUnitName));
      if (orgUnitName === '') reasons.push('org_unit is required.');
      else if (orgUnitId === undefined) {
        reasons.push(`org_unit "${orgUnitName}" does not exist. Create it before importing.`);
      }

      const roleId = lookups.roles.get(key(roleName));
      if (roleName === '') reasons.push('role is required.');
      else if (roleId === undefined) {
        reasons.push(`role "${roleName}" is not an existing ROLE. Create it before importing.`);
      }

      const skillIds: ReferenceId[] = [];
      if (skillsRaw !== '') {
        for (const raw of skillsRaw.split(SKILL_SEPARATOR)) {
          const name = raw.trim();
          if (name === '') continue;
          const id = lookups.skills.get(key(name));
          if (id === undefined) {
            reasons.push(`skill "${name}" is not an existing SKILL. Create it before importing.`);
          } else {
            skillIds.push(id);
          }
        }
      }

      // BR-M-06 restated only as far as the FILE shape requires: the component enforces the rule,
      // this reports which COLUMN is missing so the admin can fix the spreadsheet.
      let contract: MemberInput['contract'] = null;
      if (employmentRaw === 'OFF_ROLL') {
        const vendorName = get(row, 'vendor_name');
        const startDate = get(row, 'contract_start_date');
        const endDate = get(row, 'contract_end_date');
        const status = get(row, 'contract_status');

        if (vendorName === '') reasons.push('vendor_name is required for an OFF_ROLL member.');
        if (startDate === '') reasons.push('contract_start_date is required for an OFF_ROLL member.');
        else {
          const problem = invalidDate(startDate, 'contract_start_date');
          if (problem) reasons.push(problem);
        }
        if (endDate === '') reasons.push('contract_end_date is required for an OFF_ROLL member.');
        else {
          const problem = invalidDate(endDate, 'contract_end_date');
          if (problem) reasons.push(problem);
        }
        if (status === '') reasons.push('contract_status is required for an OFF_ROLL member.');

        if (reasons.length === 0) {
          contract = {
            vendorName,
            startDate: startDate as IsoDate,
            endDate: endDate as IsoDate,
            status,
          };
        }
      }

      // BR-IM-12: ALL reasons for the row, not the first.
      if (reasons.length > 0) {
        failed.push({ lineNumber: row.lineNumber, reasons });
        continue;
      }

      prepared.push({
        row,
        naturalKey: externalRef !== '' ? externalRef : key(email),
        input: {
          fullName,
          email,
          orgUnitId: orgUnitId as OrgUnitId,
          employmentType: employmentRaw as EmploymentType,
          roleId: roleId as ReferenceId,
          externalRef: externalRef === '' ? null : externalRef,
          skillIds,
          contract,
        },
      });
    }

    // --- duplicates (BR-IM-06/08/09) ---------------------------------------
    const existing = await this.members.findNaturalKeys(
      prepared.map((item) => item.input.email),
      prepared.map((item) => item.input.externalRef ?? ''),
    );
    const byEmail = new Map(existing.map((row) => [key(row.email), row]));
    const byRef = new Map(
      existing
        .filter((row) => row.externalRef !== null)
        .map((row) => [row.externalRef as string, row]),
    );

    const { valid, conflicts } = this.partitionConflicts(prepared, (item) => {
      const ref = item.input.externalRef;
      const hit = ref !== null ? byRef.get(ref) : byEmail.get(key(item.input.email));
      // BR-IM-06 uses external_ref when present — but an email collision is still a collision, so
      // it is checked too. Missing it would let import create a second row for the same person
      // under a new identifier, which is exactly what FR-I-04 exists to prevent.
      const emailHit = byEmail.get(key(item.input.email));
      const found = hit ?? emailHit;
      return found ? { id: found.id, label: found.fullName } : null;
    });

    return this.writeAll(
      'MEMBER',
      parsed.rows.length,
      parsed.ignoredColumns,
      failed,
      conflicts,
      valid,
      async (repos, items) => {
        const component = this.memberComponentOver(repos);
        for (const item of items) {
          await component.create(item.input, UNRESTRICTED);
        }
      },
    );
  }

  async importProjects(filename: string, content: Buffer): Promise<ImportResult> {
    const parsed = readCsv('PROJECT', filename, content, this.limits);
    if (!parsed.ok) return parsed.result;

    const lookups = await this.loadLookups();
    const failed: RowFailure[] = [];
    const prepared: PreparedProject[] = [];

    for (const row of parsed.rows) {
      const reasons: string[] = [];

      const code = get(row, 'code');
      const name = get(row, 'name');
      const typeName = get(row, 'project_type');
      const orgUnitName = get(row, 'owning_org_unit');
      const startDate = get(row, 'start_date');
      const endDate = get(row, 'planned_end_date');
      const description = get(row, 'description');

      if (code === '') reasons.push('code is required.');
      if (name === '') reasons.push('name is required.');

      const projectTypeId = lookups.projectTypes.get(key(typeName));
      if (typeName === '') reasons.push('project_type is required.');
      else if (projectTypeId === undefined) {
        reasons.push(
          `project_type "${typeName}" is not an existing PROJECT_TYPE. Create it before importing.`,
        );
      }

      const orgUnitId = lookups.orgUnits.get(key(orgUnitName));
      if (orgUnitName === '') reasons.push('owning_org_unit is required.');
      else if (orgUnitId === undefined) {
        reasons.push(`owning_org_unit "${orgUnitName}" does not exist. Create it before importing.`);
      }

      if (startDate === '') reasons.push('start_date is required.');
      else {
        const problem = invalidDate(startDate, 'start_date');
        if (problem) reasons.push(problem);
      }
      if (endDate === '') reasons.push('planned_end_date is required.');
      else {
        const problem = invalidDate(endDate, 'planned_end_date');
        if (problem) reasons.push(problem);
      }

      if (reasons.length > 0) {
        failed.push({ lineNumber: row.lineNumber, reasons });
        continue;
      }

      prepared.push({
        row,
        naturalKey: key(code),
        input: {
          code,
          name,
          description: description === '' ? null : description,
          owningOrgUnitId: orgUnitId as OrgUnitId,
          projectTypeId: projectTypeId as ReferenceId,
          startDate: startDate as IsoDate,
          plannedEndDate: endDate as IsoDate,
        },
      });
    }

    const existing = await this.projects.findByCodes(prepared.map((item) => item.input.code));
    const byCode = new Map(existing.map((row) => [key(row.code), row]));

    const { valid, conflicts } = this.partitionConflicts(prepared, (item) => {
      const found = byCode.get(key(item.input.code));
      return found ? { id: found.id, label: found.name } : null;
    });

    return this.writeAll(
      'PROJECT',
      parsed.rows.length,
      parsed.ignoredColumns,
      failed,
      conflicts,
      valid,
      async (repos, items) => {
        const component = this.projectComponentOver(repos);
        for (const item of items) {
          await component.create(item.input, UNRESTRICTED);
        }
      },
    );
  }

  /**
   * BR-IM-08 and BR-IM-09 in one pass, IN FILE ORDER.
   *
   * File order matters and must be preserved: BR-IM-09 says the FIRST occurrence of a natural key
   * wins, so a non-deterministic iteration order would make two runs of the same file import
   * different rows. The report names the earlier line number, which is what lets an admin find
   * and delete the right duplicate.
   */
  private partitionConflicts<T extends { row: ParsedRow; naturalKey: string }>(
    prepared: T[],
    findExisting: (item: T) => { id: string; label: string } | null,
  ): { valid: T[]; conflicts: RowConflict[] } {
    const seen = new Map<string, number>();
    const valid: T[] = [];
    const conflicts: RowConflict[] = [];

    for (const item of prepared) {
      const existing = findExisting(item);
      if (existing !== null) {
        conflicts.push({
          lineNumber: item.row.lineNumber,
          naturalKey: item.naturalKey,
          existingRecord: existing,
          existingLineNumber: null,
        });
        continue;
      }

      const earlier = seen.get(item.naturalKey);
      if (earlier !== undefined) {
        conflicts.push({
          lineNumber: item.row.lineNumber,
          naturalKey: item.naturalKey,
          existingRecord: null,
          existingLineNumber: earlier,
        });
        continue;
      }

      seen.set(item.naturalKey, item.row.lineNumber);
      valid.push(item);
    }

    return { valid, conflicts };
  }

  /**
   * Phase 4 and 5 — BR-IM-16/17/18.
   *
   * ONE transaction for all valid rows. If any write fails unexpectedly at the database level the
   * whole import rolls back and NOTHING is created; there is no half-applied state to explain or
   * to clean up.
   */
  private async writeAll<T extends { row: ParsedRow }>(
    kind: ImportKind,
    totalRows: number,
    ignoredColumns: string[],
    failed: RowFailure[],
    conflicts: RowConflict[],
    valid: T[],
    write: (repos: ReturnType<typeof createRepositories>, items: T[]) => Promise<void>,
  ): Promise<ImportResult> {
    // BR-IM-18: nothing to write is a distinct, explicitly-named outcome — never a silent success.
    if (valid.length === 0) {
      return {
        kind,
        outcome: 'NOTHING_CREATED',
        totalRows,
        created: 0,
        failed,
        conflicts,
        ignoredColumns,
        refusalReason: null,
      };
    }

    try {
      await this.db.transaction().execute(async (tx) => {
        // BR-IM-11: the repository bundle is bound to the TRANSACTION, so Unit 1's components
        // write inside it. This is the seam that makes one-transaction-for-all-rows possible
        // without import reimplementing a single validation rule.
        await write(createRepositories(tx), valid);
      });
    } catch (error) {
      /**
       * A component rejection here means validation and the component disagree — the row passed
       * phase 3 but a BR-M-* or BR-P-* rule refused it. The transaction has rolled back, so
       * NOTHING was created, and reporting that honestly matters more than salvaging the run.
       *
       * The error's own message is included because it names the rule; the ROW is not, because
       * BR-IM-24 forbids row contents in any surfaced diagnostic that reaches a log.
       */
      const detail = error instanceof AppError ? error.message : 'the database rejected the batch';
      return {
        kind,
        outcome: 'NOTHING_CREATED',
        totalRows,
        created: 0,
        failed: [
          ...failed,
          {
            lineNumber: 0,
            reasons: [
              `The import was rolled back and nothing was created: ${detail}`,
              'Correct the file and upload it again — no partial data was written.',
            ],
          },
        ],
        conflicts,
        ignoredColumns,
        refusalReason: null,
      };
    }

    return {
      kind,
      outcome: 'CREATED',
      totalRows,
      created: valid.length,
      failed,
      conflicts,
      ignoredColumns,
      refusalReason: null,
    };
  }

  /**
   * BR-IM-11: writes go through Unit 1's components, over the TRANSACTION.
   *
   * `createRepositories(tx)` is the seam that makes this possible, and it exists because Unit 1
   * put transaction boundaries in the service layer rather than inside components (R2-1 rule 3).
   * No Unit 1 code changes to support import.
   */
  private memberComponentOver(repos: ReturnType<typeof createRepositories>): MemberComponent {
    const referenceData = new ReferenceDataComponent(repos.referenceData);
    return new MemberComponent(
      repos.members,
      repos.orgUnits,
      referenceData,
      this.assignmentComponentOver(repos),
    );
  }

  private projectComponentOver(repos: ReturnType<typeof createRepositories>): ProjectComponent {
    const referenceData = new ReferenceDataComponent(repos.referenceData);
    return new ProjectComponent(
      repos.projects,
      repos.assignments,
      repos.orgUnits,
      referenceData,
      this.assignmentComponentOver(repos),
    );
  }

  /**
   * Import creates members and projects, never assignments, so this auto-ender is a constructor
   * dependency that is never exercised. Stated because the absence of BR-A-24's member lock in a
   * bulk write path otherwise looks like an oversight: there is no capacity check here to race.
   */
  private assignmentComponentOver(
    repos: ReturnType<typeof createRepositories>,
  ): AssignmentComponent {
    return new AssignmentComponent(
      this.db,
      repos.assignments as AssignmentRepository,
      repos.assignmentHistory as AssignmentHistoryRepository,
      repos.members,
      repos.projects,
      new AllocationComponent(),
    );
  }
}
