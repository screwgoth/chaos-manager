/**
 * ImportResultReport tests — US-IMP-03, US-IMP-04. Step 16.
 *
 * The two assertions that carry real weight:
 *
 *   1. `NOTHING_CREATED` renders DISTINCTLY from a created-zero. Collapsing them is how an admin
 *      concludes an import "worked" when every row was rejected.
 *   2. Conflicts and failures render as SEPARATE sections. They call for different corrections —
 *      delete the row versus fix the row — and a merged list destroys that distinction.
 */

import { render, screen } from '@testing-library/react';
import { ImportResultReport } from './ImportResultReport';
import type { ImportResult } from './api';

function result(overrides: Partial<ImportResult> = {}): ImportResult {
  return {
    kind: 'MEMBER',
    outcome: 'CREATED',
    totalRows: 3,
    created: 3,
    failed: [],
    conflicts: [],
    ignoredColumns: [],
    refusalReason: null,
    ...overrides,
  };
}

describe('ImportResultReport', () => {
  it('reports what was created', () => {
    render(<ImportResultReport result={result()} />);
    expect(screen.getByTestId('import-created')).toHaveTextContent('3 people created');
  });

  /** BR-IM-18 — the distinction ImportOutcome exists for. */
  it('renders NOTHING_CREATED distinctly, never as an empty success', () => {
    render(
      <ImportResultReport
        result={result({ outcome: 'NOTHING_CREATED', created: 0, totalRows: 4 })}
      />,
    );

    expect(screen.getByTestId('import-nothing-created')).toBeInTheDocument();
    expect(screen.queryByTestId('import-created')).not.toBeInTheDocument();
    // It must SAY nothing was added, not merely show a zero.
    expect(screen.getByTestId('import-nothing-created')).toHaveTextContent(/nothing was added/i);
  });

  it('a refused FILE shows only the refusal, with no misleading counts', () => {
    render(
      <ImportResultReport
        result={result({
          outcome: 'FILE_REFUSED',
          created: 0,
          totalRows: 0,
          refusalReason: 'Excel files are not supported yet.',
        })}
      />,
    );
    expect(screen.getByTestId('import-file-refused')).toHaveTextContent(/Excel files/);
    // No "0 created" section, which would read as a processed-but-empty import.
    expect(screen.queryByTestId('import-created')).not.toBeInTheDocument();
    expect(screen.queryByTestId('import-nothing-created')).not.toBeInTheDocument();
  });

  /** US-IMP-03 AC 3 — all reasons, not the first. */
  it('lists EVERY reason for a failed row', () => {
    render(
      <ImportResultReport
        result={result({
          outcome: 'NOTHING_CREATED',
          created: 0,
          failed: [
            {
              lineNumber: 4,
              reasons: ['email is required.', 'role "Wizard" is not an existing ROLE.'],
            },
          ],
        })}
      />,
    );

    const failure = screen.getByTestId('import-failure-4');
    expect(failure).toHaveTextContent('Row 4');
    expect(failure).toHaveTextContent('email is required.');
    expect(failure).toHaveTextContent('Wizard');
  });

  describe('conflicts and failures are SEPARATE sections', () => {
    const mixed = result({
      created: 1,
      totalRows: 3,
      failed: [{ lineNumber: 3, reasons: ['email is required.'] }],
      conflicts: [
        {
          lineNumber: 4,
          naturalKey: 'ada@example.com',
          existingRecord: { id: 'm-1', label: 'Ada Lovelace' },
          existingLineNumber: null,
        },
      ],
    });

    it('renders both, in their own sections', () => {
      render(<ImportResultReport result={mixed} />);
      expect(screen.getByTestId('import-conflicts')).toBeInTheDocument();
      expect(screen.getByTestId('import-failures')).toBeInTheDocument();
    });

    it('a conflict NAMES the existing record (BR-IM-08)', () => {
      render(<ImportResultReport result={mixed} />);
      expect(screen.getByTestId('import-conflict-4')).toHaveTextContent('Ada Lovelace');
    });

    it('the conflict section frames a re-run as expected, not as an error', () => {
      render(<ImportResultReport result={mixed} />);
      expect(screen.getByTestId('import-conflicts')).toHaveTextContent(/expected when re-running/i);
    });

    it('an in-file duplicate points at the EARLIER line (BR-IM-09)', () => {
      render(
        <ImportResultReport
          result={result({
            created: 1,
            conflicts: [
              {
                lineNumber: 5,
                naturalKey: 'dup@example.com',
                existingRecord: null,
                existingLineNumber: 2,
              },
            ],
          })}
        />,
      );
      expect(screen.getByTestId('import-conflict-5')).toHaveTextContent('duplicates row 2');
    });
  });

  /** BR-IM-04 / BR-M-09 — how a dropped commercial column becomes visible. */
  it('names ignored columns and says nothing from them was saved', () => {
    render(
      <ImportResultReport result={result({ ignoredColumns: ['day_rate', 'po_number'] })} />,
    );
    const notice = screen.getByTestId('import-ignored-columns');
    expect(notice).toHaveTextContent('day_rate');
    expect(notice).toHaveTextContent('po_number');
    expect(notice).toHaveTextContent(/Nothing from them was saved/i);
  });

  /** Q10:A — an unsaveable report that does not admit it is a trap. */
  it('warns that the report is not saved', () => {
    render(<ImportResultReport result={result()} />);
    expect(screen.getByTestId('import-not-saved-notice')).toHaveTextContent(/not saved/i);
  });

  it('says "projects" for a project import', () => {
    render(<ImportResultReport result={result({ kind: 'PROJECT', created: 2, totalRows: 2 })} />);
    expect(screen.getByTestId('import-created')).toHaveTextContent('2 projects created');
  });
});
