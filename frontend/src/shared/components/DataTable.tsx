/**
 * DataTable — the paginated table shell.
 *
 * TEST IDS USE ENTITY IDS, NEVER ROW INDICES. `row-{member.id}` survives a sort, a filter and a
 * new record appearing; `row-0` breaks on all three and, worse, silently starts asserting
 * against a different record than the test author meant.
 */

import type { ReactNode } from 'react';
import { EmptyState, LoadingState } from './states';

export interface Column<T> {
  key: string;
  header: string;
  render: (row: T) => ReactNode;
  /** Right-aligns numeric columns so figures line up down the column. */
  numeric?: boolean;
  className?: string;
}

export interface DataTableProps<T> {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  loading?: boolean;
  emptyMessage?: string;
  emptyHint?: string;
  onRowClick?: (row: T) => void;
  pagination?: {
    total: number;
    offset: number;
    limit: number;
    onOffsetChange: (offset: number) => void;
  };
  testId?: string;
}

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  loading = false,
  emptyMessage = 'Nothing to show.',
  emptyHint,
  onRowClick,
  pagination,
  testId,
}: DataTableProps<T>): JSX.Element {
  if (loading) return <LoadingState />;

  // BR-M-18: an explicit empty result, distinguishable from an error or a loading state.
  if (rows.length === 0) return <EmptyState message={emptyMessage} hint={emptyHint} />;

  return (
    <div data-testid={testId}>
      <div className="scroll-x rounded-card bg-white shadow-card">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-line text-left">
              {columns.map((column) => (
                <th
                  key={column.key}
                  scope="col"
                  className={`label-micro whitespace-nowrap px-4 py-2.5 ${
                    column.numeric ? 'text-right' : ''
                  }`}
                >
                  {column.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={rowKey(row)}
                data-testid={`row-${rowKey(row)}`}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                className={`border-b border-line-faint last:border-b-0 ${
                  onRowClick ? 'cursor-pointer transition-colors hover:bg-canvas' : ''
                }`}
              >
                {columns.map((column) => (
                  <td
                    key={column.key}
                    className={`px-4 py-3 align-middle text-[13px] ${column.numeric ? 'text-right tabular-nums' : ''} ${column.className ?? ''}`}
                  >
                    {column.render(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {pagination ? <Pagination {...pagination} shown={rows.length} /> : null}
    </div>
  );
}

function Pagination({
  total,
  offset,
  limit,
  shown,
  onOffsetChange,
}: {
  total: number;
  offset: number;
  limit: number;
  shown: number;
  onOffsetChange: (offset: number) => void;
}): JSX.Element {
  const first = total === 0 ? 0 : offset + 1;
  const last = offset + shown;
  const hasPrevious = offset > 0;
  const hasNext = last < total;

  return (
    <div className="mt-3 flex items-center justify-between text-[13px] text-ink-muted">
      <span className="tabular-nums">
        {first}–{last} of {total}
      </span>
      <div className="flex gap-2">
        <button
          type="button"
          disabled={!hasPrevious}
          onClick={() => onOffsetChange(Math.max(0, offset - limit))}
          className="rounded-card border border-line-strong bg-white px-2.5 py-1 font-medium transition-colors hover:border-brand-500/60 hover:text-brand-600 disabled:opacity-40"
        >
          Previous
        </button>
        <button
          type="button"
          disabled={!hasNext}
          onClick={() => onOffsetChange(offset + limit)}
          className="rounded-card border border-line-strong px-2 py-1 disabled:opacity-40"
        >
          Next
        </button>
      </div>
    </div>
  );
}
