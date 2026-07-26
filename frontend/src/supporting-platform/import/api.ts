/**
 * Import API types and the one call that cannot go through `api` — the multipart upload.
 *
 * `api.post` sends JSON. A file upload needs `FormData` with the browser setting its own
 * multipart boundary, so this uses `fetch` directly. It still carries `credentials: 'include'`,
 * without which the session cookie is not sent and every upload 401s.
 */

export type ImportKind = 'MEMBER' | 'PROJECT';
export type ImportOutcome = 'CREATED' | 'NOTHING_CREATED' | 'FILE_REFUSED';

export interface RowFailure {
  lineNumber: number;
  reasons: string[];
}

export interface RowConflict {
  lineNumber: number;
  naturalKey: string;
  existingRecord: { id: string; label: string } | null;
  existingLineNumber: number | null;
}

export interface ImportResult {
  kind: ImportKind;
  outcome: ImportOutcome;
  totalRows: number;
  created: number;
  failed: RowFailure[];
  conflicts: RowConflict[];
  ignoredColumns: string[];
  refusalReason: string | null;
}

/**
 * Mirrors the server's BR-IM-02 ceilings so the client can refuse an oversized file before
 * uploading it.
 *
 * DUPLICATING A SERVER RULE IS NORMALLY WRONG — this is the one place it is right, and only
 * because the MESSAGE is the same and the server check remains authoritative. Uploading 5 MB to
 * be told the limit is 5 MB is a bad experience; the client check is a courtesy, never the
 * enforcement (BR-IM-01/02, U2-NFR-U-08).
 */
export const MAX_BYTES = 5 * 1024 * 1024;

export function localFileProblem(file: File): string | null {
  if (!file.name.toLowerCase().endsWith('.csv')) {
    if (/\.xlsx?$/i.test(file.name)) {
      // Same guidance the server gives, because FR-I-01 is only partially satisfied (Q7:A).
      return 'Excel files are not supported yet. Open the file and use "Save As" to write a .csv, then upload that.';
    }
    return `Only .csv files are accepted. "${file.name}" is not a .csv file.`;
  }
  if (file.size > MAX_BYTES) {
    const actual = (file.size / 1_048_576).toFixed(1);
    return `The file is ${actual} MB, over the 5 MB limit. Split it into smaller files.`;
  }
  return null;
}

export interface UploadOutcome {
  result: ImportResult | null;
  /** Set when the request itself failed — not a rejected file, which arrives as a result. */
  transportError: string | null;
}

export async function uploadImport(kind: ImportKind, file: File): Promise<UploadOutcome> {
  const form = new FormData();
  form.append('file', file);

  const path = kind === 'MEMBER' ? '/api/imports/members' : '/api/imports/projects';

  const response = await fetch(path, {
    method: 'POST',
    body: form,
    // Without this the session cookie is not sent and the upload 401s.
    credentials: 'include',
  });

  // A refused FILE comes back as 400 WITH a result body, which the report renders. A 403 or a
  // transport failure has no report to show, so those are surfaced separately.
  if (response.status === 403) {
    return { result: null, transportError: 'Only an administrator can import data.' };
  }

  let parsed: unknown;
  try {
    parsed = await response.json();
  } catch {
    return { result: null, transportError: 'The server response could not be read.' };
  }

  if (parsed !== null && typeof parsed === 'object' && 'outcome' in parsed) {
    return { result: parsed as ImportResult, transportError: null };
  }

  const message =
    parsed !== null && typeof parsed === 'object' && 'error' in parsed
      ? String((parsed as { error: { message?: string } }).error.message ?? 'The import failed.')
      : 'The import failed.';
  return { result: null, transportError: message };
}

export function templateUrl(kind: ImportKind): string {
  return `/api/imports/template/${kind === 'MEMBER' ? 'members' : 'projects'}`;
}
