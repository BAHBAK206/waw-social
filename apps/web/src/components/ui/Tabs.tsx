import { useCallback, useRef, type KeyboardEvent, type ReactNode } from 'react';
import { useSearchParams } from 'react-router';
import { cx } from '@/lib/cx';

export interface TabDef<K extends string> {
  key: K;
  label: ReactNode;
  icon?: ReactNode;
  badge?: ReactNode;
  hidden?: boolean;
}

/** Keeps the active tab in the URL (?tab=) so deep links and the back button work. */
export function useTabParam<K extends string>(keys: readonly K[], fallback: K, param = 'tab'): [K, (k: K) => void] {
  const [params, setParams] = useSearchParams();
  const raw = params.get(param);
  const active = (keys as readonly string[]).includes(raw ?? '') ? (raw as K) : fallback;
  const set = useCallback(
    (k: K) =>
      setParams(
        (p) => {
          const next = new URLSearchParams(p);
          if (k === fallback) next.delete(param);
          else next.set(param, k);
          return next;
        },
        { replace: true },
      ),
    [fallback, param, setParams],
  );
  return [active, set];
}

export function Tabs<K extends string>({
  tabs,
  active,
  onChange,
  className,
  label,
}: {
  tabs: TabDef<K>[];
  active: K;
  onChange: (k: K) => void;
  className?: string;
  label?: string;
}) {
  const visible = tabs.filter((t) => !t.hidden);
  const refs = useRef(new Map<K, HTMLButtonElement>());
  const onKey = (e: KeyboardEvent) => {
    const i = visible.findIndex((t) => t.key === active);
    const rtl = document.documentElement.dir === 'rtl';
    let next = i;
    if (e.key === (rtl ? 'ArrowLeft' : 'ArrowRight')) next = (i + 1) % visible.length;
    else if (e.key === (rtl ? 'ArrowRight' : 'ArrowLeft')) next = (i - 1 + visible.length) % visible.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = visible.length - 1;
    else return;
    e.preventDefault();
    const k = visible[next]!.key;
    onChange(k);
    refs.current.get(k)?.focus();
  };
  return (
    <div role="tablist" aria-label={label} className={cx('tabs', className)} onKeyDown={onKey}>
      {visible.map((t) => (
        <button
          key={t.key}
          ref={(el) => {
            if (el) refs.current.set(t.key, el);
          }}
          type="button"
          role="tab"
          aria-selected={t.key === active}
          tabIndex={t.key === active ? 0 : -1}
          className="tab"
          onClick={() => onChange(t.key)}
        >
          {t.icon}
          {t.label}
          {t.badge}
        </button>
      ))}
    </div>
  );
}
