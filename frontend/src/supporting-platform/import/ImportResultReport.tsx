/**
 * The import result report — US-IMP-03, US-IMP-04.
 *
 * THREE SECTIONS, ALWAYS IN THIS ORDER: created, conflicts, failures.
 *
 * Conflicts and failures are NOT merged into one list, and that is the whole design of this
 * component. They call for different corrections — a conflict means "already there, delete the
 * row"; a failure means "wrong, fix the row". An admin scanning forty problems needs to know
 * which are harmless re-runs and which are real errors, and a single mixed list destroys that
 * distinction.
 */

import type { ImportResult } from './api';

function Section({
  title,
  tone,
  children,
  testId,
}: {
  title: string;
  tone: 'good' | 'warn' | 'bad';
  children: React.ReactNode;
  testId: string;
}): JSX.Element {
  const border =
    tone === 'good'
      ? 'border-good-500/30 bg-good-500/[.08]'
      : tone === 'warn'
        ? 'border-flag-400/45 bg-flag-400/[.12]'
        : 'border-danger-500/30 bg-danger-500/[.06]';
  return (
    <section className={`rounded-md border px-4 py-3 ${border}`} data-testid={testId}>
      <h3 className="text-sm font-semibold text-ink">{title}</h3>
      <div className="mt-2 text-sm text-ink">{children}</div>
    </section>
  );
}

export function ImportResultReport({ result }: { result: ImportResult }): JSX.Element {
  const noun = result.kind === 'MEMBER' ? 'people' : 'projects';

  /**
   * FILE_REFUSED never reached row processing, so counts would be meaningless. Rendering the
   * refusal alone — rather than "0 created" alongside empty sections — is what stops it reading
   * as a processed-but-empty import.
   */
  if (result.outcome === 'FILE_REFUSED') {
    return (
      <div className="space-y-3" data-testid="import-result">
        <Section title="The file was not accepted" tone="bad" testId="import-file-refused">
          <p>{result.refusalReason}</p>
        </Section>
      </div>
    );
  }

  return (
    <div className="space-y-3" data-testid="import-result">
      {/**
       * BR-IM-18: NOTHING_CREATED is rendered as an explicit statement, never as an empty
       * success. Distinguishing it from "created 0" is the entire reason ImportOutcome has three
       * values rather than a count.
       */}
      {result.outcome === 'NOTHING_CREATED' ? (
        <Section title="No records were created" tone="warn" testId="import-nothing-created">
          <p>
            The file was read and all {result.totalRows} row{result.totalRows === 1 ? '' : 's'} were
            processed, but every row either already exists or could not be accepted. Nothing was
            added.
          </p>
        </Section>
      ) : (
        <Section title={`${result.created} ${noun} created`} tone="good" testId="import-created">
          <p>
            {result.created} of {result.totalRows} row{result.totalRows === 1 ? '' : 's'} were
            imported.
          </p>
        </Section>
      )}

      {result.ignoredColumns.length > 0 && (
        <Section title="Some columns were ignored" tone="warn" testId="import-ignored-columns">
          <p>
            These columns are not part of the import and were skipped:{' '}
            <span className="font-medium">{result.ignoredColumns.join(', ')}</span>.
          </p>
          {/* BR-M-09: this is how a dropped `day_rate` becomes visible rather than assumed. */}
          <p className="mt-1 text-ink-muted">
            Nothing from them was saved. Remove them from the file if that was not intended.
          </p>
        </Section>
      )}

      {result.conflicts.length > 0 && (
        <Section
          title={`${result.conflicts.length} row${result.conflicts.length === 1 ? '' : 's'} already existed`}
          tone="warn"
          testId="import-conflicts"
        >
          <p className="mb-2 text-ink-muted">
            These were not imported because a record with the same identifier is already present.
            That is expected when re-running an import — delete these rows from your file.
          </p>
          <ul className="space-y-1">
            {result.conflicts.map((conflict) => (
              <li key={`${conflict.lineNumber}`} data-testid={`import-conflict-${conflict.lineNumber}`}>
                <span className="font-medium">Row {conflict.lineNumber}</span>
                {' — '}
                <span className="font-mono text-xs">{conflict.naturalKey}</span>
                {conflict.existingRecord !== null
                  ? ` already exists as "${conflict.existingRecord.label}".`
                  : ` duplicates row ${conflict.existingLineNumber} of this file.`}
              </li>
            ))}
          </ul>
        </Section>
      )}

      {result.failed.length > 0 && (
        <Section
          title={`${result.failed.length} row${result.failed.length === 1 ? '' : 's'} could not be imported`}
          tone="bad"
          testId="import-failures"
        >
          <p className="mb-2 text-ink-muted">
            Correct these rows and upload them again — the rows that succeeded will not be
            duplicated.
          </p>
          <ul className="space-y-2">
            {result.failed.map((failure) => (
              <li key={failure.lineNumber} data-testid={`import-failure-${failure.lineNumber}`}>
                <span className="font-medium">
                  {failure.lineNumber === 0 ? 'The whole import' : `Row ${failure.lineNumber}`}
                </span>
                {/* BR-IM-12: ALL reasons, not just the first. */}
                <ul className="ml-4 list-disc text-ink">
                  {failure.reasons.map((reason, index) => (
                    <li key={index}>{reason}</li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {/**
       * Q10:A — the report is not persisted. Saying so BEFORE the admin navigates away is the
       * difference between an accepted limitation and a trap.
       */}
      <p className="text-xs text-faded" data-testid="import-not-saved-notice">
        This report is not saved. Copy anything you need before leaving this page.
      </p>
    </div>
  );
}
