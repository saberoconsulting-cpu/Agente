import clsx from 'clsx';

export function Panel({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={clsx(
        'min-w-0 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm',
        className,
      )}
    >
      {children}
    </section>
  );
}

export function Button({
  children,
  variant = 'primary',
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'danger' | 'ghost';
}) {
  return (
    <button
      {...props}
      className={clsx(
        'inline-flex min-h-11 items-center justify-center rounded-xl px-4 text-sm font-black transition disabled:cursor-not-allowed disabled:opacity-50',
        variant === 'primary' &&
          'border border-sabero-electric bg-sabero-electric text-white shadow-neon hover:bg-blue-600',
        variant === 'danger' &&
          'border border-sabero-crimson bg-sabero-crimson text-white shadow-[0_16px_35px_rgba(225,29,53,0.22)] hover:bg-red-700',
        variant === 'ghost' &&
          'border border-slate-200 bg-white text-sabero-navy hover:border-sabero-electric hover:text-sabero-electric',
        className,
      )}
    >
      {children}
    </button>
  );
}

export function StatusPill({ active, label }: { active: boolean; label?: string }) {
  return (
    <span
      className={clsx(
        'inline-flex items-center rounded-full border px-3 py-1 text-xs font-black uppercase tracking-[0.12em]',
        active
          ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
          : 'border-slate-200 bg-slate-50 text-slate-500',
      )}
    >
      {label || (active ? 'Conectado' : 'Pendiente')}
    </span>
  );
}
