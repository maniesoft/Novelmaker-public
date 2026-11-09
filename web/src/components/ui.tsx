import { forwardRef, useEffect, useLayoutEffect, useRef, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { createPortal } from 'react-dom';
import { Loader2, X } from 'lucide-react';
import { create } from 'zustand';
import { useToasts } from '../lib/store';
import { locale, t } from '../lib/i18n';

export function cn(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(' ');
}

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'subtle';

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-amber-700 text-white hover:bg-amber-800 disabled:bg-amber-700/50 dark:bg-amber-600 dark:hover:bg-amber-500',
  secondary:
    'border border-stone-300 bg-white text-stone-700 hover:bg-stone-50 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-200 dark:hover:bg-stone-800',
  ghost: 'text-stone-600 hover:bg-stone-200/70 dark:text-stone-300 dark:hover:bg-stone-800',
  subtle: 'bg-stone-200/70 text-stone-700 hover:bg-stone-300/70 dark:bg-stone-800 dark:text-stone-200 dark:hover:bg-stone-700',
  danger: 'bg-red-600 text-white hover:bg-red-700 disabled:bg-red-600/50',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: 'sm' | 'md' | 'xs';
  icon?: ReactNode;
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', icon, loading, className, children, disabled, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type="button"
      disabled={disabled || loading}
      className={cn(
        'inline-flex shrink-0 items-center justify-center gap-1.5 rounded-md font-medium whitespace-nowrap transition-colors disabled:cursor-not-allowed disabled:opacity-60',
        size === 'md' && 'h-8 px-3 text-sm',
        size === 'sm' && 'h-7 px-2.5 text-[13px]',
        size === 'xs' && 'h-6 px-2 text-xs',
        VARIANTS[variant],
        className,
      )}
      {...rest}
    >
      {loading ? <Loader2 className="size-3.5 animate-spin" /> : icon}
      {children}
    </button>
  );
});

export function IconButton({ title, className, children, active, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean }) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      className={cn(
        'inline-flex size-7 shrink-0 items-center justify-center rounded-md text-stone-500 transition-colors hover:bg-stone-200/70 hover:text-stone-800 disabled:opacity-40 dark:text-stone-400 dark:hover:bg-stone-800 dark:hover:text-stone-100',
        active && 'bg-stone-200 text-stone-900 dark:bg-stone-800 dark:text-stone-100',
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

const fieldCls =
  'rounded-md border border-stone-300 bg-white px-2.5 text-sm text-stone-800 placeholder:text-stone-400 focus:border-amber-600 focus:ring-2 focus:ring-amber-600/20 focus:outline-none dark:border-stone-700 dark:bg-stone-900 dark:text-stone-100 dark:placeholder:text-stone-500';

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...rest }, ref) {
  return <input ref={ref} className={cn(fieldCls, 'h-8', !/(^|\s)w-/.test(className ?? '') && 'w-full', className)} {...rest} />;
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement> & { autoGrow?: boolean }>(function Textarea(
  { className, autoGrow, onChange, value, ...rest },
  ref,
) {
  const inner = useRef<HTMLTextAreaElement | null>(null);
  useLayoutEffect(() => {
    if (!autoGrow || !inner.current) return;
    inner.current.style.height = 'auto';
    inner.current.style.height = `${inner.current.scrollHeight + 2}px`;
  }, [value, autoGrow]);
  return (
    <textarea
      ref={(el) => {
        inner.current = el;
        if (typeof ref === 'function') ref(el);
        else if (ref) ref.current = el;
      }}
      value={value}
      onChange={onChange}
      className={cn(fieldCls, 'w-full py-1.5 leading-relaxed', autoGrow && 'resize-none overflow-hidden', className)}
      {...rest}
    />
  );
});

export function Select({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cn(fieldCls, 'h-8 pr-7', !/(^|\s)(w-|max-w-)/.test(className ?? '') && 'w-full', className)} {...rest}>
      {children}
    </select>
  );
}

export function Field({ label, hint, children, className }: { label: ReactNode; hint?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <label className={cn('block', className)}>
      <span className="mb-1 block text-xs font-medium text-stone-600 dark:text-stone-400">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-stone-500 dark:text-stone-500">{hint}</span>}
    </label>
  );
}

export function Checkbox({ checked, onChange, label, hint }: { checked: boolean; onChange: (v: boolean) => void; label: ReactNode; hint?: ReactNode }) {
  return (
    <label className="flex cursor-pointer items-start gap-2 text-sm">
      <input type="checkbox" className="mt-0.5 size-4 accent-amber-700" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>
        {label}
        {hint && <span className="block text-xs text-stone-500">{hint}</span>}
      </span>
    </label>
  );
}

export function Badge({ children, tone = 'stone', className }: { children: ReactNode; tone?: 'stone' | 'amber' | 'sky' | 'red' | 'green' | 'violet'; className?: string }) {
  const tones = {
    stone: 'bg-stone-200 text-stone-700 dark:bg-stone-800 dark:text-stone-300',
    amber: 'bg-amber-100 text-amber-900 dark:bg-amber-900/50 dark:text-amber-200',
    sky: 'bg-sky-100 text-sky-900 dark:bg-sky-900/50 dark:text-sky-200',
    red: 'bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-200',
    green: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-200',
    violet: 'bg-violet-100 text-violet-800 dark:bg-violet-900/50 dark:text-violet-200',
  };
  return <span className={cn('inline-flex items-center rounded px-1.5 py-0.5 text-[11px] font-medium', tones[tone], className)}>{children}</span>;
}

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn('size-4 animate-spin text-stone-400', className)} />;
}

export function Empty({ icon, title, children }: { icon?: ReactNode; title: ReactNode; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 p-10 text-center text-stone-500">
      {icon && <div className="text-stone-300 dark:text-stone-700">{icon}</div>}
      <div className="font-medium text-stone-700 dark:text-stone-300">{title}</div>
      {children && <div className="max-w-md text-sm">{children}</div>}
    </div>
  );
}

export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  width = 'max-w-lg',
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  width?: string;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-stone-950/40 p-4 pt-[8vh] backdrop-blur-[2px]" onMouseDown={onClose}>
      <div
        className={cn('w-full rounded-xl border border-stone-200 bg-white shadow-2xl dark:border-stone-800 dark:bg-stone-900', width)}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-stone-200 px-4 py-3 dark:border-stone-800">
          <h2 className="text-[15px] font-semibold">{title}</h2>
          <IconButton title={t('Close')} onClick={onClose}>
            <X className="size-4" />
          </IconButton>
        </div>
        <div className="max-h-[75vh] overflow-y-auto p-4">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-stone-200 px-4 py-3 dark:border-stone-800">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

/** Einfaches Popover, das an einem Anker-Element ausgerichtet wird. */
export function Popover({
  anchor,
  open,
  onClose,
  children,
  align = 'start',
  className,
}: {
  anchor: HTMLElement | null;
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  align?: 'start' | 'end';
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  useLayoutEffect(() => {
    if (!open || !anchor) return;
    const r = anchor.getBoundingClientRect();
    const el = ref.current;
    const w = el?.offsetWidth ?? 240;
    const h = el?.offsetHeight ?? 200;
    let left = align === 'end' ? r.right - w : r.left;
    left = Math.max(8, Math.min(left, window.innerWidth - w - 8));
    let top = r.bottom + 4;
    if (top + h > window.innerHeight - 8) top = Math.max(8, r.top - h - 4);
    setPos({ top, left });
  }, [open, anchor, align]);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current?.contains(e.target as Node) || anchor?.contains(e.target as Node)) return;
      onClose();
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    setTimeout(() => window.addEventListener('mousedown', onDown), 0);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open, onClose, anchor]);
  if (!open) return null;
  return createPortal(
    <div
      ref={ref}
      style={{ top: pos?.top ?? -9999, left: pos?.left ?? -9999 }}
      className={cn('fixed z-50 rounded-lg border border-stone-200 bg-white p-1 shadow-xl dark:border-stone-700 dark:bg-stone-900', className)}
    >
      {children}
    </div>,
    document.body,
  );
}

export function MenuItem({ icon, children, onClick, danger, disabled }: { icon?: ReactNode; children: ReactNode; onClick: () => void; danger?: boolean; disabled?: boolean }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-sm hover:bg-stone-100 disabled:opacity-40 dark:hover:bg-stone-800',
        danger && 'text-red-600 dark:text-red-400',
      )}
    >
      {icon && <span className="text-stone-400 [&>svg]:size-4">{icon}</span>}
      {children}
    </button>
  );
}

/** Kleines Menü mit eigenem Auslöser */
export function Menu({ trigger, children, align = 'end' }: { trigger: (open: () => void, ref: (el: HTMLElement | null) => void) => ReactNode; children: (close: () => void) => ReactNode; align?: 'start' | 'end' }) {
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  return (
    <>
      {trigger(() => setOpen((o) => !o), setAnchor)}
      <Popover anchor={anchor} open={open} onClose={() => setOpen(false)} align={align} className="min-w-48">
        {children(() => setOpen(false))}
      </Popover>
    </>
  );
}

export function Tabs<T extends string>({ value, onChange, tabs, className }: { value: T; onChange: (v: T) => void; tabs: { value: T; label: ReactNode }[]; className?: string }) {
  return (
    <div className={cn('flex gap-1 border-b border-stone-200 dark:border-stone-800', className)}>
      {tabs.map((tab) => (
        <button
          key={tab.value}
          type="button"
          onClick={() => onChange(tab.value)}
          className={cn(
            '-mb-px border-b-2 px-3 py-1.5 text-sm font-medium transition-colors',
            value === tab.value ? 'border-amber-600 text-stone-900 dark:text-stone-100' : 'border-transparent text-stone-500 hover:text-stone-800 dark:hover:text-stone-200',
          )}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

export function Toaster() {
  const { toasts, remove } = useToasts();
  return createPortal(
    <div className="fixed right-4 bottom-4 z-[60] flex w-96 max-w-[calc(100vw-2rem)] flex-col gap-2">
      {toasts.map((ts) => (
        <div
          key={ts.id}
          onClick={() => remove(ts.id)}
          className={cn(
            'cursor-pointer rounded-lg border px-3 py-2 text-sm shadow-lg',
            ts.kind === 'error' && 'border-red-200 bg-red-50 text-red-900 dark:border-red-900 dark:bg-red-950 dark:text-red-100',
            ts.kind === 'success' && 'border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-100',
            ts.kind === 'info' && 'border-stone-200 bg-white text-stone-800 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-100',
          )}
        >
          {ts.text}
        </div>
      ))}
    </div>,
    document.body,
  );
}

// ---------------------------------------------------------------- Sicherheitsabfrage

export interface ConfirmOptions {
  title?: string;
  /** Erklärung, was passiert (z. B. was mitgelöscht wird) */
  message: ReactNode;
  confirmLabel?: string;
  /** rot hervorgehoben (Standard: true) */
  danger?: boolean;
}

interface ConfirmState {
  current: (ConfirmOptions & { resolve: (ok: boolean) => void }) | null;
}
const useConfirm = create<ConfirmState>(() => ({ current: null }));

/**
 * Eigene Sicherheitsabfrage statt window.confirm (das der Browser nach „keine weiteren Dialoge“
 * stumm mit „Abbrechen“ beantwortet). Liefert true bei Bestätigung.
 */
export function confirmDialog(opts: string | ConfirmOptions): Promise<boolean> {
  const o: ConfirmOptions = typeof opts === 'string' ? { message: opts } : opts;
  const prev = useConfirm.getState().current;
  prev?.resolve(false);
  return new Promise((resolve) => useConfirm.setState({ current: { ...o, resolve } }));
}

/** Einmal in der App einbinden. */
export function ConfirmHost() {
  const current = useConfirm((s) => s.current);
  const okRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!current) return;
    setTimeout(() => okRef.current?.focus(), 0);
    // Esc/Enter hier abfangen, damit ein darunterliegender Dialog nicht mitreagiert
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' && e.key !== 'Enter') return;
      e.preventDefault();
      e.stopImmediatePropagation();
      useConfirm.setState({ current: null });
      current.resolve(e.key === 'Enter');
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [current]);
  if (!current) return null;
  const close = (ok: boolean) => {
    useConfirm.setState({ current: null });
    current.resolve(ok);
  };
  const danger = current.danger !== false;
  return (
    <Modal
      open
      onClose={() => close(false)}
      title={current.title ?? t('Delete this item?')}
      width="max-w-md"
      footer={
        <>
          <Button variant="ghost" onClick={() => close(false)}>
            {t('Cancel')}
          </Button>
          <Button ref={okRef} variant={danger ? 'danger' : 'primary'} onClick={() => close(true)}>
            {current.confirmLabel ?? t('Delete')}
          </Button>
        </>
      }
    >
      <div className="text-sm leading-relaxed text-stone-700 dark:text-stone-300">{current.message}</div>
    </Modal>
  );
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '–';
  const d = new Date(iso);
  return d.toLocaleString(locale(), { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function formatNumber(n: number): string {
  return n.toLocaleString(locale());
}
