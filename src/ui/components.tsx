/** Ortak küçük bileşenler. */
import type { ReactNode } from 'react';

export function Button({
  children,
  onClick,
  variant = 'ghost',
  size = 'md',
  disabled,
  type = 'button',
  full,
  title,
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: 'primary' | 'ghost' | 'danger' | 'ok' | 'quiet';
  size?: 'sm' | 'md' | 'lg';
  disabled?: boolean;
  type?: 'button' | 'submit';
  full?: boolean;
  /** Fareyle üzerine gelince görünen açıklama. */
  title?: string;
}) {
  const variants = {
    primary: 'bg-accent text-white hover:brightness-105 active:brightness-95 shadow-sm',
    ok: 'bg-ok-soft text-ok hover:brightness-97',
    danger: 'bg-danger-soft text-danger hover:brightness-97',
    ghost: 'bg-surface-2 text-ink-soft hover:text-ink',
    quiet: 'text-ink-soft hover:bg-surface-2',
  };
  const sizes = {
    sm: 'px-2.5 py-1.5 text-xs',
    md: 'px-3.5 py-2 text-sm',
    lg: 'px-4 py-3 text-[15px]',
  };
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`${variants[variant]} ${sizes[size]} ${full ? 'w-full' : ''} rounded-xl font-medium transition disabled:cursor-not-allowed disabled:opacity-40`}
    >
      {children}
    </button>
  );
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-card border border-line bg-surface p-4 ${className}`}>{children}</div>
  );
}

/** Alttan açılan panel — mobil ve masaüstünde aynı davranır. */
export function Sheet({
  open,
  title,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <button aria-label="Kapat" className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="safe-bottom relative max-h-[92vh] w-full overflow-y-auto rounded-t-3xl border border-line bg-surface p-5 shadow-2xl sm:max-w-lg sm:rounded-3xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-[17px] font-semibold">{title}</h2>
          <button
            onClick={onClose}
            className="grid h-8 w-8 place-items-center rounded-lg text-muted transition hover:bg-surface-2 hover:text-ink"
            aria-label="Kapat"
          >
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="mb-3.5 block">
      <span className="mb-1.5 block text-xs font-medium text-ink-soft">{label}</span>
      {children}
    </label>
  );
}

export const inputClass =
  'w-full rounded-xl border border-line bg-surface-2 px-3 py-2.5 text-sm text-ink outline-none transition focus:border-accent focus:bg-surface';

export function EmptyState({
  icon,
  title,
  hint,
  action,
}: {
  icon: string;
  title: string;
  hint?: string;
  action?: ReactNode;
}) {
  return (
    <div className="rounded-card border border-dashed border-line py-10 text-center">
      <div className="mb-3 text-3xl">{icon}</div>
      <p className="font-medium">{title}</p>
      {hint && <p className="mx-auto mt-1 max-w-xs text-sm text-muted">{hint}</p>}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}
