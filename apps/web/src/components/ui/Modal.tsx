import { X } from 'lucide-react';
import { useEffect, useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { cx } from '@/lib/cx';
import { useT } from '@/lib/i18n';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'full';
  /** Prevents closing by backdrop click (e.g. unsaved forms). */
  dismissible?: boolean;
  className?: string;
}

const sizes = { sm: 'md:max-w-sm', md: 'md:max-w-lg', lg: 'md:max-w-2xl', xl: 'md:max-w-4xl', full: 'md:max-w-[96vw] md:h-[92vh]' };

let openCount = 0;

/** Accessible dialog: focus moves in and returns on close, Escape closes, page scroll is locked. Bottom sheet on phones. */
export function Modal({ open, onClose, title, children, footer, size = 'md', dismissible = true, className }: ModalProps) {
  const tr = useT();
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    openCount++;
    document.body.style.overflow = 'hidden';
    const el = ref.current;
    const focusables = () =>
      Array.from(el?.querySelectorAll<HTMLElement>('button,[href],input,select,textarea,[tabindex]:not([tabindex="-1"])') ?? []).filter(
        (n) => !n.hasAttribute('disabled'),
      );
    const first = focusables().find((n) => n.dataset.autofocus !== undefined) ?? focusables()[1] ?? focusables()[0];
    first?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onCloseRef.current();
      }
      if (e.key === 'Tab') {
        const list = focusables();
        if (!list.length) return;
        const a = list[0]!;
        const b = list[list.length - 1]!;
        if (e.shiftKey && document.activeElement === a) {
          e.preventDefault();
          b.focus();
        } else if (!e.shiftKey && document.activeElement === b) {
          e.preventDefault();
          a.focus();
        }
      }
    };
    el?.addEventListener('keydown', onKey);
    return () => {
      el?.removeEventListener('keydown', onKey);
      openCount--;
      if (openCount <= 0) document.body.style.overflow = '';
      previous?.focus?.();
    };
  }, [open]);

  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-end justify-center md:items-center md:p-4" role="presentation">
      <div className="animate-fade absolute inset-0 bg-[var(--overlay)]" onClick={() => dismissible && onClose()} aria-hidden />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        className={cx(
          'card animate-slide-up md:animate-pop relative flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-b-none md:rounded-b-[var(--radius-card)]',
          'bg-[var(--card-solid)]',
          sizes[size],
          className,
        )}
      >
        <div className="flex items-center gap-2 border-b border-line px-4 py-2 md:px-5">
          <h2 id={titleId} className="min-w-0 flex-1 truncate text-lg font-black">
            {title}
          </h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label={tr.t('common.close')}>
            <X className="size-5" />
          </button>
        </div>
        <div className="scroll-thin min-h-0 flex-1 overflow-y-auto px-4 py-4 md:px-5">{children}</div>
        {footer && <div className="safe-bottom flex flex-wrap justify-end gap-2 border-t border-line px-4 py-3 md:px-5">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}
