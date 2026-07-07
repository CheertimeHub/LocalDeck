// UI primitives — รวม class ที่ซ้ำทั้งแอปมาไว้ที่เดียว (design system Phase 6)
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';

// ---- Button ----

type ButtonVariant = 'primary' | 'ghost' | 'danger';
const BUTTON_VARIANT: Record<ButtonVariant, string> = {
  primary: 'bg-sky-600 text-white hover:bg-sky-500',
  ghost: 'text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200',
  danger: 'text-red-400 hover:bg-red-500/10',
};

export function Button({
  variant = 'primary',
  className = '',
  children,
  ...props
}: { variant?: ButtonVariant } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      className={`inline-flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition disabled:opacity-50 ${BUTTON_VARIANT[variant]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

// ---- IconButton (ปุ่มไอคอนสี่เหลี่ยม) ----

export function IconButton({
  icon: Icon,
  title,
  onClick,
  disabled,
  className = '',
}: {
  icon: LucideIcon;
  title: string;
  onClick: () => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      disabled={disabled}
      className={`flex h-8 w-8 items-center justify-center rounded-md text-neutral-400 transition hover:bg-neutral-800 hover:text-neutral-100 disabled:cursor-not-allowed disabled:opacity-30 ${className}`}
    >
      <Icon size={15} strokeWidth={2} />
    </button>
  );
}

// ---- Card ----

export function Card({ className = '', children, ...rest }: { className?: string; children: ReactNode } & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={`rounded-lg border border-neutral-800 bg-neutral-900/60 ${className}`} {...rest}>
      {children}
    </div>
  );
}

// ---- Input ----

export function Input({ className = '', mono, ...props }: { mono?: boolean } & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={`w-full rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 placeholder-neutral-600 outline-none focus:border-sky-500 ${mono ? 'font-mono' : ''} ${className}`}
      {...props}
    />
  );
}

// ---- Badge (pill เล็ก) ----

type BadgeTone = 'info' | 'success' | 'neutral' | 'warning';
const BADGE_TONE: Record<BadgeTone, string> = {
  info: 'bg-sky-500/10 text-sky-400',
  success: 'bg-emerald-500/10 text-emerald-400',
  neutral: 'bg-neutral-800 text-neutral-400',
  warning: 'bg-amber-500/10 text-amber-400',
};

export function Badge({ tone = 'neutral', children }: { tone?: BadgeTone; children: ReactNode }) {
  return <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide ${BADGE_TONE[tone]}`}>{children}</span>;
}

// ---- StatusDot ----

export function StatusDot({ className = '', pulse }: { className?: string; pulse?: boolean }) {
  return <span className={`inline-block h-2 w-2 shrink-0 rounded-full ${pulse ? 'animate-pulse' : ''} ${className}`} />;
}
