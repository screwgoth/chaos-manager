/**
 * The file gate and CSV parse — BR-IM-01/02/03/04/05.
 *
 * Everything here is READ-ONLY and happens before any transaction opens (BR-IM-17).
 *
 * WHY A LIBRARY (N-Q7:A). Quoted fields containing commas or newlines, CRLF line endings and a
 * UTF-8 BOM are exactly where a hand-rolled parser fails — and it fails by SILENTLY SHIFTING
 * COLUMNS rather than raising an error, so a member's email lands in the org-unit field and the
 * row either fails confusingly or validates as nonsense. Real spreadsheet exports contain all of
 * these.
 *
 * `relax_column_count: false` is deliberate: the permissive setting pads short rows and truncates
 * long ones, converting a malformed file into plausible-looking rows with fields in the wrong
 * places — the very failure the library was chosen to avoid.
 */

import { parse } from 'csv-parse/sync';
import { columnsFor, type ImportKind } from './column-contracts';
import { fileRefused, type ImportResult } from './import-types';

export interface ParsedRow {
  /** 1-based, INCLUDING the header line, so it matches a spreadsheet's row numbers (BR-IM-20). */
  lineNumber: number;
  values: Record<string, string>;
}

export interface ParseSuccess {
  ok: true;
  rows: ParsedRow[];
  ignoredColumns: string[];
}

export interface ParseFailure {
  ok: false;
  result: ImportResult;
}

export interface CsvLimits {
  maxRows: number;
  maxBytes: number;
}

/** Guidance rows in the generated template start with this and are skipped (BR-IM-26). */
const COMMENT_PREFIX = '#';

export function readCsv(
  kind: ImportKind,
  filename: string,
  content: Buffer,
  limits: CsvLimits,
): ParseSuccess | ParseFailure {
  // BR-IM-01: CSV only. Q7:A defers Excel, so FR-I-01 is PARTIALLY satisfied — and the message
  // must say what to do rather than merely refusing.
  const lower = filename.toLowerCase();
  if (lower.endsWith('.xlsx') || lower.endsWith('.xls')) {
    return {
      ok: false,
      result: fileRefused(
        kind,
        'Excel files are not supported yet. Open the file and use "Save As" to write a .csv, then upload that.',
      ),
    };
  }
  if (!lower.endsWith('.csv')) {
    return {
      ok: false,
      result: fileRefused(kind, `Only .csv files are accepted. "${filename}" is not a .csv file.`),
    };
  }

  // BR-IM-02: refuse on size BEFORE parsing, so an oversized file never becomes 2,000 objects.
  if (content.byteLength > limits.maxBytes) {
    const actualMb = (content.byteLength / 1_048_576).toFixed(1);
    const limitMb = (limits.maxBytes / 1_048_576).toFixed(0);
    return {
      ok: false,
      result: fileRefused(
        kind,
        `The file is ${actualMb} MB, over the ${limitMb} MB limit. Split it into smaller files.`,
      ),
    };
  }

  let records: Record<string, string>[];
  try {
    records = parse(content, {
      columns: (header: string[]) => header.map((name) => name.trim().toLowerCase()),
      bom: true,
      skip_empty_lines: true,
      comment: COMMENT_PREFIX,
      trim: true,
      // BR-IM-03: a wrong field count is an ERROR, never silently padded.
      relax_column_count: false,
    }) as Record<string, string>[];
  } catch (error) {
    // The parser's own message names the line, which is more useful than a generic refusal.
    const detail = error instanceof Error ? error.message : 'unreadable';
    return {
      ok: false,
      result: fileRefused(kind, `The file could not be read as CSV: ${detail}`),
    };
  }

  if (records.length === 0) {
    // BR-IM-05: distinct from "imported zero rows" — the file itself is unusable.
    return {
      ok: false,
      result: fileRefused(kind, 'The file has a header but no data rows.'),
    };
  }

  // BR-IM-02: row cap.
  if (records.length > limits.maxRows) {
    return {
      ok: false,
      result: fileRefused(
        kind,
        `The file has ${records.length} rows, over the ${limits.maxRows} row limit. Split it into smaller files.`,
      ),
    };
  }

  const spec = columnsFor(kind);
  const known = new Set(spec.map((column) => column.header));
  const present = new Set(Object.keys(records[0] ?? {}));

  // BR-IM-03: report EVERY missing required column at once. One-per-attempt would make fixing a
  // file an iterative guessing game.
  const missing = spec
    .filter((column) => column.required && !present.has(column.header))
    .map((column) => column.header);
  if (missing.length > 0) {
    return {
      ok: false,
      result: fileRefused(
        kind,
        `These required columns are missing: ${missing.join(', ')}. Download the template to see the expected columns.`,
      ),
    };
  }

  // BR-IM-04: unknown columns are ignored and NAMED. This is also what keeps BR-M-09 safe — a
  // `day_rate` column has no field to land in, and the admin is told it was dropped.
  const ignoredColumns = [...present].filter((name) => !known.has(name) && name !== '');

  const rows: ParsedRow[] = records.map((values, index) => ({
    // +2: one for the header line, one to make it 1-based.
    lineNumber: index + 2,
    values,
  }));

  return { ok: true, rows, ignoredColumns };
}
