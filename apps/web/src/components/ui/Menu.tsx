import { MoreHorizontal } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { cx } from '@/lib/cx';
import { useT } from '@/lib/i18n';

export interface MenuItem {
  label: ReactNode;
  icon?: ReactNode;
  onSelect: () => void;
  danger?: boolean;
  hidden?: boolean;
  disabled?: boolean;
}

/** Small popover menu (kebab menu) with keyboard support. */
export function Menu({ items, trigger, label, align = 'end', className }: { items: MenuItem[]; trigger?: ReactNode; label?: string; align?: 'start' | 'end'; className?: string }) {
  const tr = useT();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const visible = items.filter((i) => !i.hidden);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    ref.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus();
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (!visible.length) return null;
  return (
    <div ref={ref} className={cx('relative inline-block', className)}>
      <button
        type="button"
        className="icon-btn icon-btn-sm"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={label ?? tr.t('common.more')}
        title={label ?? tr.t('common.more')}
        onClick={() => setOpen((o) => !o)}
      >
        {trigger ?? <MoreHorizontal className="size-5" />}
      </button>
      {open && (
        <div
          role="menu"
          className={cx('card animate-pop absolute z-50 mt-1 min-w-48 overflow-hidden bg-[var(--card-solid)] py-1', align === 'end' ? 'end-0' : 'start-0')}
          onKeyDown={(e) => {
            const els = Array.from(ref.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)') ?? []);
            const i = els.indexOf(document.activeElement as HTMLButtonElement);
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              els[(i + 1) % els.length]?.focus();
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              els[(i - 1 + els.length) % els.length]?.focus();
            }
          }}
        >
          {visible.map((item, i) => (
            <button
              key={i}
              type="button"
              role="menuitem"
              disabled={item.disabled}
              className={cx(
                'flex min-h-11 w-full items-center gap-3 px-4 text-start text-sm font-bold hover:bg-bg-3 disabled:opacity-50',
                item.danger ? 'text-err' : 'text-fg',
              )}
              onClick={() => {
                setOpen(false);
                item.onSelect();
              }}
            >
              {item.icon}
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
