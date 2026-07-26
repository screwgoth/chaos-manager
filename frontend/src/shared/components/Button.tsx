/**
 * Buttons.
 *
 * `danger` is reserved for actions with a cascade — deactivating a member, closing a project.
 * Those end other people's assignments, so they must not look like an ordinary save.
 */

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost';

const VARIANT: Record<Variant, string> = {
  primary: 'bg-slate-900 text-white hover:bg-slate-700 disabled:bg-slate-400',
  secondary: 'border border-slate-300 text-slate-700 hover:border-slate-500 hover:text-slate-900',
  danger: 'bg-allocation-over text-white hover:bg-allocation-over/90 disabled:bg-slate-400',
  ghost: 'text-slate-600 hover:text-slate-900 hover:underline',
};

export function Button({
  variant = 'primary',
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }): JSX.Element {
  return (
    <button
      {...props}
      className={`rounded px-3 py-2 text-sm font-medium transition-colors motion-reduce:transition-none focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400/60 disabled:cursor-not-allowed ${VARIANT[variant]} ${props.className ?? ''}`}
    >
      {children}
    </button>
  );
}
