/**
 * EmptyState and ErrorState.
 *
 * BR-V-08 / BR-M-18: an empty result is stated explicitly, never a blank table. A blank table
 * is ambiguous — the user cannot tell whether nothing matched, something is still loading, or
 * the screen is broken. Each of those calls for a different reaction from them.
 */

export function EmptyState({
  message,
  hint,
  action,
  testId = 'empty-state',
}: {
  message: string;
  hint?: string;
  action?: React.ReactNode;
  testId?: string;
}): JSX.Element {
  return (
    <div
      className="rounded border border-dashed border-slate-300 px-6 py-10 text-center"
      data-testid={testId}
    >
      <p className="text-sm font-medium text-slate-700">{message}</p>
      {hint ? <p className="mt-1 text-sm text-slate-500">{hint}</p> : null}
      {action ? <div className="mt-4 flex justify-center">{action}</div> : null}
    </div>
  );
}

/**
 * ErrorState.
 *
 * Shows the server's message, which is written for the user and already free of internals —
 * the API returns a generic message for unrecognised failures precisely so this component can
 * display whatever it receives without leaking a stack trace.
 */
export function ErrorState({
  error,
  onRetry,
}: {
  error: unknown;
  onRetry?: () => void;
}): JSX.Element {
  const message =
    error instanceof Error && error.message !== '' ? error.message : 'Something went wrong.';

  return (
    <div
      className="rounded border border-allocation-over/30 bg-allocation-over/5 px-4 py-3"
      role="alert"
      data-testid="error-state"
    >
      <p className="text-sm text-allocation-over">{message}</p>
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="mt-2 text-sm font-medium text-slate-700 underline hover:no-underline"
        >
          Try again
        </button>
      ) : null}
    </div>
  );
}

export function LoadingState({ label = 'Loading' }: { label?: string }): JSX.Element {
  return (
    <div className="px-4 py-10 text-center text-sm text-slate-500" data-testid="loading-state">
      {label}…
    </div>
  );
}
