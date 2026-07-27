/**
 * The import column contract — BR-IM-26.
 *
 * ONE definition drives BOTH parsing and template generation. A hand-maintained template drifts
 * from the parser, and the drift is discovered by a user whose correct file is rejected — so the
 * template is GENERATED from this, never written out separately.
 *
 * FR-C-01 vocabulary discipline: every header below is domain-neutral. No IT, Sales or Operations
 * term appears.
 *
 * BR-M-09: there is NO rate, cost, contract-value or purchase-order column, and there must never
 * be one in Phase 1. Per BR-IM-04 such a column in a source file is ignored and named back to the
 * admin, so its absence is visible rather than silent.
 */

export interface ColumnSpec {
  header: string;
  required: boolean;
  description: string;
}

export type ImportKind = 'MEMBER' | 'PROJECT';

/**
 * Skills are SEMICOLON-separated, not comma-separated, deliberately.
 *
 * A comma inside a CSV field forces quoting, and an unquoted comma is the single most common
 * hand-edit mistake in a spreadsheet export — it silently shifts every subsequent column, so a
 * member's email lands in the org-unit field. A semicolon needs no quoting and cannot cause that.
 */
export const SKILL_SEPARATOR = ';';

export const MEMBER_COLUMNS: readonly ColumnSpec[] = [
  { header: 'full_name', required: true, description: "The person's full name." },
  { header: 'email', required: true, description: 'Unique. Used as the natural key when external_ref is absent.' },
  { header: 'external_ref', required: false, description: 'Your own identifier, if you have one. Preferred natural key.' },
  { header: 'org_unit', required: true, description: 'Must already exist. Matched by name, case-insensitive.' },
  { header: 'employment_type', required: true, description: 'ON_ROLL or OFF_ROLL.' },
  { header: 'role', required: true, description: 'Must already exist as reference data of type ROLE.' },
  { header: 'skills', required: false, description: `Semicolon-separated (${SKILL_SEPARATOR}). Each must already exist as a SKILL.` },
  { header: 'vendor_name', required: false, description: 'Required when employment_type is OFF_ROLL.' },
  { header: 'contract_start_date', required: false, description: 'YYYY-MM-DD. Required when OFF_ROLL.' },
  { header: 'contract_end_date', required: false, description: 'YYYY-MM-DD. Required when OFF_ROLL.' },
  { header: 'contract_status', required: false, description: 'Free text. Required when OFF_ROLL.' },
];

export const PROJECT_COLUMNS: readonly ColumnSpec[] = [
  { header: 'code', required: true, description: 'Unique. The natural key.' },
  { header: 'name', required: true, description: 'Project name.' },
  { header: 'project_type', required: true, description: 'Must already exist as reference data of type PROJECT_TYPE.' },
  { header: 'owning_org_unit', required: true, description: 'Must already exist. Matched by name, case-insensitive.' },
  { header: 'start_date', required: true, description: 'YYYY-MM-DD.' },
  { header: 'planned_end_date', required: true, description: 'YYYY-MM-DD.' },
  { header: 'description', required: false, description: 'Optional free text.' },
];

export function columnsFor(kind: ImportKind): readonly ColumnSpec[] {
  return kind === 'MEMBER' ? MEMBER_COLUMNS : PROJECT_COLUMNS;
}

/**
 * The downloadable template — US-IMP-05, generated from the contract above (BR-IM-26/27).
 *
 * Two rows: the header, and a commented guidance row naming which columns are required. The
 * guidance row starts with `#`, which the parser skips, so the file imports unmodified — US-IMP-05
 * AC 2 requires exactly that ("populate and upload it unmodified in structure").
 */
export function templateCsv(kind: ImportKind): string {
  const columns = columnsFor(kind);
  const header = columns.map((column) => column.header).join(',');
  const guidance = columns
    .map((column) => (column.required ? 'required' : 'optional'))
    .join(',');
  return `${header}\n#${guidance}\n`;
}
