import { Plus } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { cx } from '@/lib/cx';
import { useT } from '@/lib/i18n';
import type { SheetContent } from './docs';
import { colName, createEvaluator, formatValue } from './formula';

const MAX_ROWS = 500;
const MAX_COLS = 52;

export function SheetEditor({ value, onChange }: { value: SheetContent; onChange: (v: SheetContent) => void }) {
  const tr = useT();
  const [sel, setSel] = useState<{ r: number; c: number }>({ r: 1, c: 0 });
  const [editing, setEditing] = useState<string | null>(null);
  /** Where the text is being typed: inside the cell or in the formula bar (only one input may own focus). */
  const [editor, setEditor] = useState<'cell' | 'bar'>('cell');
  const input = useRef<HTMLInputElement>(null);
  const ev = useMemo(() => createEvaluator(value.cells), [value.cells]);
  const ref = (r: number, c: number) => `${colName(c)}${r}`;
  const selRef = ref(sel.r, sel.c);

  const setCell = (key: string, raw: string) => {
    const cells = { ...value.cells };
    if (raw === '') delete cells[key];
    else cells[key] = raw;
    onChange({ ...value, cells });
  };

  const commit = (move?: { dr: number; dc: number }) => {
    if (editing !== null) setCell(selRef, editing);
    setEditing(null);
    if (move) setSel((s) => ({ r: Math.max(1, Math.min(value.rows, s.r + move.dr)), c: Math.max(0, Math.min(value.cols - 1, s.c + move.dc)) }));
  };

  const onKey = (e: React.KeyboardEvent) => {
    const rtl = document.documentElement.dir === 'rtl';
    if (editing !== null) {
      if (e.key === 'Enter') {
        e.preventDefault();
        commit({ dr: 1, dc: 0 });
      } else if (e.key === 'Tab') {
        e.preventDefault();
        commit({ dr: 0, dc: e.shiftKey ? -1 : 1 });
      } else if (e.key === 'Escape') setEditing(null);
      return;
    }
    const move = (dr: number, dc: number) => {
      e.preventDefault();
      setSel((s) => ({ r: Math.max(1, Math.min(value.rows, s.r + dr)), c: Math.max(0, Math.min(value.cols - 1, s.c + dc)) }));
    };
    if (e.key === 'ArrowDown') move(1, 0);
    else if (e.key === 'ArrowUp') move(-1, 0);
    else if (e.key === 'ArrowLeft') move(0, rtl ? 1 : -1);
    else if (e.key === 'ArrowRight') move(0, rtl ? -1 : 1);
    else if (e.key === 'Tab') move(0, e.shiftKey ? -1 : 1);
    else if (e.key === 'Enter' || e.key === 'F2') {
      e.preventDefault();
      setEditor('cell');
      setEditing(value.cells[selRef] ?? '');
      setTimeout(() => input.current?.focus());
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      setCell(selRef, '');
    } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      setEditor('cell');
      setEditing('');
      setTimeout(() => input.current?.focus());
    }
  };

  return (
    <div className="card overflow-hidden">
      <div className="flex items-center gap-2 border-b border-line p-2">
        <span className="badge badge-primary min-w-12 justify-center font-mono" dir="ltr">
          {selRef}
        </span>
        <input
          className="input h-9 min-h-0 flex-1 font-mono"
          dir="ltr"
          value={editing ?? value.cells[selRef] ?? ''}
          aria-label={selRef}
          onFocus={() => {
            setEditor('bar');
            if (editing === null) setEditing(value.cells[selRef] ?? '');
          }}
          onChange={(e) => setEditing(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              commit({ dr: 1, dc: 0 });
            }
          }}
          onBlur={() => commit()}
        />
      </div>
      <div
        className="scroll-thin max-h-[68vh] overflow-auto"
        tabIndex={0}
        onKeyDown={onKey}
        role="grid"
        aria-label={tr.t('workspace.kinds.sheet')}
        aria-rowcount={value.rows}
        aria-colcount={value.cols}
      >
        <table className="border-separate border-spacing-0 text-sm" dir="ltr">
          <thead>
            <tr>
              <th className="sticky start-0 top-0 z-20 w-10 border-b border-e border-line bg-bg-2" />
              {Array.from({ length: value.cols }, (_, c) => (
                <th key={c} className={cx('sticky top-0 z-10 h-8 min-w-28 border-b border-e border-line bg-bg-2 font-bold', sel.c === c && 'bg-soft text-ink')}>
                  {colName(c)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: value.rows }, (_, i) => i + 1).map((r) => (
              <tr key={r}>
                <th className={cx('sticky start-0 z-10 border-b border-e border-line bg-bg-2 text-center font-bold', sel.r === r && 'bg-soft text-ink')}>
                  {r}
                </th>
                {Array.from({ length: value.cols }, (_, c) => {
                  const k = ref(r, c);
                  const isSel = sel.r === r && sel.c === c;
                  const shown = formatValue(ev.get(k));
                  const err = shown.startsWith('#');
                  return (
                    <td
                      key={c}
                      role="gridcell"
                      aria-selected={isSel}
                      className={cx(
                        'h-8 max-w-64 min-w-28 truncate border-b border-e border-line px-2 whitespace-nowrap',
                        isSel && 'outline outline-2 -outline-offset-2 outline-[var(--primary)]',
                        err && 'text-err',
                        typeof ev.get(k) === 'number' && 'text-end tabular-nums',
                      )}
                      onMouseDown={() => {
                        if (editing !== null) commit();
                        setSel({ r, c });
                      }}
                      onDoubleClick={() => {
                        setEditor('cell');
                        setEditing(value.cells[k] ?? '');
                        setTimeout(() => input.current?.focus());
                      }}
                    >
                      {isSel && editing !== null && editor === 'cell' ? (
                        <input
                          ref={input}
                          autoFocus
                          className="size-full bg-transparent font-mono outline-none"
                          value={editing}
                          onChange={(e) => setEditing(e.target.value)}
                          onKeyDown={onKey}
                          onBlur={() => commit()}
                        />
                      ) : (
                        shown
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center gap-2 border-t border-line p-2">
        <Button
          size="sm"
          variant="ghost"
          icon={<Plus className="size-4" />}
          disabled={value.rows >= MAX_ROWS}
          onClick={() => onChange({ ...value, rows: Math.min(MAX_ROWS, value.rows + 10) })}
        >
          {tr.t('workspace.sheet.addRow')}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          icon={<Plus className="size-4" />}
          disabled={value.cols >= MAX_COLS}
          onClick={() => onChange({ ...value, cols: Math.min(MAX_COLS, value.cols + 2) })}
        >
          {tr.t('workspace.sheet.addColumn')}
        </Button>
        <span className="muted ms-auto text-xs">{tr.t('workspace.sheet.formulaHint')}</span>
      </div>
    </div>
  );
}
