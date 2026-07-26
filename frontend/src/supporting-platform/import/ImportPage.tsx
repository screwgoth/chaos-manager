/**
 * F-07 Import — US-IMP-01..05.
 *
 * NO PROGRESS BAR, deliberately. Q13:A made import synchronous, so there is no observable
 * progress to report — only a pending state. A bar that animates on a timer is a lie about system
 * state, and it is worse than a spinner because it implies knowledge the client does not have
 * (U2-NFR-U-04).
 *
 * The radio has NO DEFAULT. Importing people into the project registry is not a mistake worth
 * making easy, so the choice is deliberate rather than pre-selected.
 */

import { useState } from 'react';
import { Button, Field, Select } from '../../shared/components';
import { useSession } from '../../shared/session/SessionProvider';
import { ImportResultReport } from './ImportResultReport';
import {
  localFileProblem,
  templateUrl,
  uploadImport,
  type ImportKind,
  type ImportResult,
} from './api';

type Status = 'idle' | 'uploading' | 'done';

/**
 * A local banner rather than `FormErrors`, which takes an `ApiError`.
 *
 * These two messages are not API violations: one is a client-side file check, the other a
 * transport failure. Wrapping them in a fake `ApiError` to reuse the shared component would be
 * dishonest about where they came from.
 */
function Problem({ message, testId }: { message: string; testId: string }): JSX.Element {
  return (
    <p
      className="rounded border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-900"
      data-testid={testId}
    >
      {message}
    </p>
  );
}

export function ImportPage(): JSX.Element {
  const { user } = useSession();
  const [kind, setKind] = useState<'' | ImportKind>('');
  const [file, setFile] = useState<File | null>(null);
  const [localProblem, setLocalProblem] = useState<string | null>(null);
  const [transportError, setTransportError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [status, setStatus] = useState<Status>('idle');

  /**
   * U2-NFR-U-02 / U2-NFR-U-03: hiding a control is a courtesy, never the enforcement. A non-admin
   * who navigates here directly gets this state, and the API refuses them independently (403).
   * Rendering a FORBIDDEN state rather than a generic error is the point — "you lack permission"
   * is actionable; "something went wrong" is not.
   */
  if (user !== null && user.role !== 'ADMIN') {
    return (
      <div className="mx-auto max-w-2xl px-4 py-10" data-testid="import-forbidden">
        <h1 className="text-lg font-semibold text-slate-900">Import</h1>
        <p className="mt-2 text-sm text-slate-700">
          Only an administrator can import data. Ask an administrator if you need a spreadsheet
          loaded.
        </p>
      </div>
    );
  }

  function chooseFile(selected: File | null): void {
    setFile(selected);
    setResult(null);
    setTransportError(null);
    setStatus('idle');
    // The SAME message the server would give, checked early purely to save a 5 MB upload.
    setLocalProblem(selected === null ? null : localFileProblem(selected));
  }

  async function submit(): Promise<void> {
    if (kind === '' || file === null || localProblem !== null) return;
    setStatus('uploading');
    setTransportError(null);
    setResult(null);

    const outcome = await uploadImport(kind, file);
    setResult(outcome.result);
    setTransportError(outcome.transportError);
    setStatus('done');
  }

  const canSubmit = kind !== '' && file !== null && localProblem === null && status !== 'uploading';

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-8">
      <header>
        <h1 className="text-lg font-semibold text-slate-900">Import from a spreadsheet</h1>
        <p className="mt-1 text-sm text-slate-600">
          Load people or projects from a CSV file. Existing records are reported rather than
          duplicated, so it is safe to re-run an import.
        </p>
      </header>

      <div className="space-y-4 rounded-md border border-slate-200 bg-white px-4 py-4">
        <Field label="What are you importing?" htmlFor="import-kind">
          <Select
            id="import-kind"
            data-testid="import-kind-select"
            value={kind}
            onChange={(event) => {
              setKind(event.target.value as '' | ImportKind);
              setResult(null);
              setStatus('idle');
            }}
          >
            {/* No default: the choice must be deliberate. */}
            <option value="">Choose…</option>
            <option value="MEMBER">People</option>
            <option value="PROJECT">Projects</option>
          </Select>
        </Field>

        {kind !== '' && (
          <>
            <p className="text-sm text-slate-700">
              <a
                className="font-medium text-sky-700 underline"
                href={templateUrl(kind)}
                data-testid="import-template-link"
              >
                Download the {kind === 'MEMBER' ? 'people' : 'projects'} template
              </a>{' '}
              — it lists every column and which are required.
            </p>

            {/**
             * Reference data must exist first (BR-IM-13): import matches names and never creates
             * vocabulary. Saying so here prevents the worst first experience, which is a file
             * where every row fails on an org unit that was never created.
             */}
            <p className="rounded border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
              Org units{kind === 'MEMBER' ? ', roles and skills' : ' and project types'} must
              already exist. Values in the file are matched by name — unmatched values are reported,
              never created.
            </p>

            <Field label="CSV file" htmlFor="import-file">
              <input
                id="import-file"
                data-testid="import-file-input"
                type="file"
                accept=".csv,text/csv"
                className="block w-full text-sm text-slate-700"
                onChange={(event) => chooseFile(event.target.files?.[0] ?? null)}
              />
            </Field>

            {localProblem !== null && <Problem message={localProblem} testId="import-file-problem" />}

            <Button
              onClick={() => {
                void submit();
              }}
              disabled={!canSubmit}
              data-testid="import-submit"
            >
              {/* Pending, not progress. There is nothing to measure. */}
              {status === 'uploading' ? 'Importing…' : 'Import'}
            </Button>

            {status === 'uploading' && (
              <p className="text-sm text-slate-600" data-testid="import-pending">
                Reading the file and checking every row. A large file can take up to half a minute.
              </p>
            )}
          </>
        )}
      </div>

      {transportError !== null && (
        <Problem message={transportError} testId="import-transport-error" />
      )}

      {result !== null && <ImportResultReport result={result} />}
    </div>
  );
}
