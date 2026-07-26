/**
 * Import result shapes — the response contract for US-IMP-01..05.
 *
 * `ImportOutcome` exists to keep three states distinct that a naive design collapses into
 * "0 created". Conflating them is how an admin concludes an import "worked" when every row was
 * rejected.
 */

import type { ImportKind } from './column-contracts';

export type ImportOutcome =
  /** At least one row was written. */
  | 'CREATED'
  /** The file was valid and fully processed, but every row failed or conflicted (BR-IM-18). */
  | 'NOTHING_CREATED'
  /** The file never reached row processing — bad format, missing column, over a limit. */
  | 'FILE_REFUSED';

/** All reasons for one row, never just the first (BR-IM-12). */
export interface RowFailure {
  /** 1-based line number INCLUDING the header, so it matches what a spreadsheet shows (BR-IM-20). */
  lineNumber: number;
  reasons: string[];
}

export interface RowConflict {
  lineNumber: number;
  /** The natural key that collided (BR-IM-06/07). */
  naturalKey: string;
  /** An existing record it matches... */
  existingRecord: { id: string; label: string } | null;
  /** ...or an earlier row in the same file (BR-IM-09). Exactly one of these is set. */
  existingLineNumber: number | null;
}

export interface ImportResult {
  kind: ImportKind;
  outcome: ImportOutcome;
  /** Data rows seen, excluding the header and skipped comment lines. */
  totalRows: number;
  created: number;
  failed: RowFailure[];
  conflicts: RowConflict[];
  /**
   * Columns in the file that the contract does not use (BR-IM-04). Named back to the admin so a
   * dropped `day_rate` or `po_number` is visible rather than assumed imported (BR-M-09).
   */
  ignoredColumns: string[];
  /** Set only when `outcome` is FILE_REFUSED. */
  refusalReason: string | null;
}

export function fileRefused(kind: ImportKind, reason: string): ImportResult {
  return {
    kind,
    outcome: 'FILE_REFUSED',
    totalRows: 0,
    created: 0,
    failed: [],
    conflicts: [],
    ignoredColumns: [],
    refusalReason: reason,
  };
}
