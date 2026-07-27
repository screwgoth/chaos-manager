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
      className="rounded-card border border-dashed border-line-strong bg-white/60 px-6 py-10 text-center"
      data-testid={testId}
    >
      <p className="text-[13.5px] font-medium text-ink">{message}</p>
      {hint ? <p className="mt-1 text-[13px] text-faded">{hint}</p> : null}
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
      className="rounded-card border border-allocation-over/25 bg-allocation-over/[.06] px-4 py-3"
      role="alert"
      data-testid="error-state"
    >
      <p className="text-[13px] text-danger-700">{message}</p>
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="mt-2 text-[13px] font-semibold text-brand-600 underline hover:no-underline"
        >
          Try again
        </button>
      ) : null}
    </div>
  );
}

export function LoadingState({ label = 'Loading' }: { label?: string }): JSX.Element {
  return (
    <div className="px-4 py-10 text-center text-[13px] text-faded" data-testid="loading-state">
      {label}…
    </div>
  );
}
