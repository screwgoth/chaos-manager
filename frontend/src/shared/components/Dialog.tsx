/**
 * Dialog — a blocking modal.
 *
 * Used for the confirmations that carry a CASCADE: the over-allocation warning (Q14:A requires
 * it to block), deactivating a member, closing a project. Each ends other people's assignments,
 * so a dismissible toast would be the wrong shape entirely.
 *
 * Escape closes and focus moves into the dialog, because a modal a keyboard user cannot leave
 * is a trap.
 */

import { useEffect, useRef, type ReactNode } from 'react';

export function Dialog({
  title,
  children,
  footer,
  onClose,
  tone = 'neutral',
  testId,
}: {
  title: string;
  children: ReactNode;
  footer: ReactNode;
  onClose: () => void;
  tone?: 'neutral' | 'warning';
  testId?: string;
}): JSX.Element {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    panelRef.current?.focus();
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4"
      role="presentation"
      onClick={(event) => {
        // Only a click on the backdrop itself closes — not one that bubbled from the panel.
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        data-testid={testId}
        className="w-full max-w-xl rounded-lg bg-white shadow-xl focus:outline-none"
      >
        <div
          className={`rounded-t-lg border-b px-5 py-3 ${
            tone === 'warning'
              ? 'border-allocation-over/30 bg-allocation-over/5'
              : 'border-slate-200'
          }`}
        >
          <h2
            className={`text-base font-semibold ${
              tone === 'warning' ? 'text-allocation-over' : 'text-slate-900'
            }`}
          >
            {title}
          </h2>
        </div>

        <div className="px-5 py-4">{children}</div>

        <div className="flex justify-end gap-2 rounded-b-lg border-t border-slate-200 bg-slate-50 px-5 py-3">
          {footer}
        </div>
      </div>
    </div>
  );
}
