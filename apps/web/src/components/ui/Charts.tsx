import { useId, useMemo, useState } from 'react';
import { cx } from '@/lib/cx';
import { useT } from '@/lib/i18n';

export interface Datum {
  label: string;
  value: number;
  /** Optional longer label for the tooltip/table. */
  title?: string;
}

function niceMax(v: number): number {
  if (v <= 0) return 1;
  const exp = Math.pow(10, Math.floor(Math.log10(v)));
  const f = v / exp;
  const nice = f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10;
  return nice * exp;
}

function compact(n: number, intl: string) {
  try {
    return new Intl.NumberFormat(intl, { notation: 'compact', maximumFractionDigits: 1 }).format(n);
  } catch {
    return String(n);
  }
}

/**
 * Single-series column chart: ≤24px columns with a 4px rounded data end (square at the baseline),
 * hairline grid, per-column hover/focus tooltip and a visually hidden data table for screen readers.
 */
export function ColumnChart({
  data,
  title,
  unit,
  height = 180,
  className,
  formatValue,
}: {
  data: Datum[];
  title: string;
  unit?: string;
  height?: number;
  className?: string;
  formatValue?: (v: number) => string;
}) {
  const tr = useT();
  const id = useId();
  const [active, setActive] = useState<number | null>(null);
  const max = useMemo(() => niceMax(Math.max(0, ...data.map((d) => d.value))), [data]);
  const fmt = formatValue ?? ((v: number) => `${compact(v, tr.intl)}${unit ? ` ${unit}` : ''}`);
  const ticks = [max, max / 2, 0];
  const labelEvery = Math.max(1, Math.ceil(data.length / 8));

  return (
    <figure className={cx('relative', className)} aria-labelledby={`${id}-t`}>
      <figcaption id={`${id}-t`} className="mb-2 text-sm font-bold text-fg-2">
        {title}
      </figcaption>
      <div className="flex gap-2" aria-hidden>
        <div className="flex w-9 shrink-0 flex-col justify-between text-end text-[11px] leading-none text-fg-3" style={{ height }}>
          {ticks.map((t) => (
            <span key={t}>{compact(t, tr.intl)}</span>
          ))}
        </div>
        <div className="relative min-w-0 flex-1">
          <div className="pointer-events-none absolute inset-x-0 top-0 flex flex-col justify-between" style={{ height }}>
            {ticks.map((t) => (
              <div key={t} className="h-px bg-line" />
            ))}
          </div>
          <div className="relative flex items-end gap-[2px]" style={{ height }}>
            {data.map((d, i) => (
              <div
                key={i}
                tabIndex={0}
                className="group relative flex h-full flex-1 cursor-default items-end justify-center outline-none"
                onMouseEnter={() => setActive(i)}
                onMouseLeave={() => setActive(null)}
                onFocus={() => setActive(i)}
                onBlur={() => setActive(null)}
                aria-label={`${d.title ?? d.label}: ${fmt(d.value)}`}
              >
                <div
                  className={cx('chart-bar w-[56%] max-w-6 rounded-t-[4px] transition-opacity', active !== null && active !== i && 'opacity-60')}
                  style={{ height: `${(d.value / max) * 100}%`, minHeight: d.value > 0 ? 2 : 0 }}
                />
                {active === i && (
                  <div className="card absolute bottom-full z-10 mb-1 bg-[var(--card-solid)] px-2.5 py-1 text-center text-xs whitespace-nowrap shadow-lg">
                    <div className="font-bold text-fg">{fmt(d.value)}</div>
                    <div className="muted">{d.title ?? d.label}</div>
                  </div>
                )}
              </div>
            ))}
          </div>
          <div className="mt-1 flex gap-[2px] text-[11px] text-fg-3">
            {data.map((d, i) => (
              <span key={i} className="flex-1 truncate text-center">
                {i % labelEvery === 0 ? d.label : ''}
              </span>
            ))}
          </div>
        </div>
      </div>
      <table className="sr-only">
        <caption>{title}</caption>
        <tbody>
          {data.map((d, i) => (
            <tr key={i}>
              <th scope="row">{d.title ?? d.label}</th>
              <td>{fmt(d.value)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}

export function ProgressBar({ value, max = 100, className, label }: { value: number; max?: number; className?: string; label?: string }) {
  const pct = Math.max(0, Math.min(100, (value / (max || 1)) * 100));
  return (
    <div
      className={cx('h-2.5 w-full overflow-hidden rounded-full bg-soft', className)}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={Math.round(value)}
      aria-label={label}
    >
      <div className="h-full rounded-full bg-[linear-gradient(90deg,var(--grad-from),var(--grad-to))] transition-[width] duration-500" style={{ width: `${pct}%` }} />
    </div>
  );
}

export function ProgressRing({ value, max = 100, size = 64, stroke = 7, children, label }: { value: number; max?: number; size?: number; stroke?: number; children?: React.ReactNode; label?: string }) {
  const pct = Math.max(0, Math.min(1, value / (max || 1)));
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative inline-grid place-items-center" style={{ width: size, height: size }} role="progressbar" aria-valuenow={Math.round(pct * 100)} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--primary-soft)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          className="chart-stroke transition-[stroke-dashoffset] duration-700"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - pct)}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">{children}</div>
    </div>
  );
}
