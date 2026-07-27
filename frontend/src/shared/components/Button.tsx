/**
 * Buttons.
 *
 * `danger` is reserved for actions with a cascade — deactivating a member, closing a project.
 * Those end other people's assignments, so they must not look like an ordinary save.
 *
 * `secondary` is a teal OUTLINE rather than a grey one. The mockups pair the two constantly —
 * "Edit project" beside "+ Assign member" — and a grey outline next to a teal fill reads as
 * disabled rather than as the quieter of two available actions.
 */

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost';

const VARIANT: Record<Variant, string> = {
  primary: 'bg-brand-500 text-white shadow-raised hover:bg-brand-600 disabled:bg-faded-soft',
  secondary:
    'border border-brand-500/55 bg-white text-brand-600 hover:border-brand-500 hover:bg-brand-50',
  danger: 'bg-allocation-over text-white hover:bg-danger-700 disabled:bg-faded-soft',
  ghost: 'text-ink-muted hover:bg-line-soft hover:text-ink',
};

export function Button({
  variant = 'primary',
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }): JSX.Element {
  return (
    <button
      {...props}
      className={`rounded-card px-3.5 py-2 text-[13px] font-semibold transition-colors motion-reduce:transition-none disabled:cursor-not-allowed ${VARIANT[variant]} ${props.className ?? ''}`}
    >
      {children}
    </button>
  );
}
