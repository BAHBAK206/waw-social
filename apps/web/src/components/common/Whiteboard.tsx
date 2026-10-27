import { getStroke } from 'perfect-freehand';
import { Eraser, Highlighter, PenLine, Trash2, Undo2 } from 'lucide-react';
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { cx } from '@/lib/cx';
import { useT } from '@/lib/i18n';

export interface Stroke {
  /** [x, y, pressure] in board units (0..W / 0..H). */
  points: [number, number, number][];
  color: string;
  size: number;
  tool: 'pen' | 'highlighter';
}

export const BOARD_W = 1280;
export const BOARD_H = 720;
const COLORS = ['#111827', '#d63031', '#0984e3', '#00b894', '#e17055', '#6c5ce7', '#fdcb6e', '#ffffff'];

function pathFor(s: Stroke): Path2D {
  const outline = getStroke(s.points, {
    size: s.tool === 'highlighter' ? s.size * 3 : s.size,
    thinning: s.tool === 'highlighter' ? 0 : 0.5,
    smoothing: 0.6,
    streamline: 0.5,
  });
  const p = new Path2D();
  if (!outline.length) return p;
  p.moveTo(outline[0]![0]!, outline[0]![1]!);
  for (let i = 1; i < outline.length; i++) {
    const [x0, y0] = outline[i]!;
    const [x1, y1] = outline[(i + 1) % outline.length]!;
    p.quadraticCurveTo(x0!, y0!, (x0! + x1!) / 2, (y0! + y1!) / 2);
  }
  p.closePath();
  return p;
}

function paint(ctx: CanvasRenderingContext2D, strokes: Stroke[], bg: string) {
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, BOARD_W, BOARD_H);
  for (const s of strokes) {
    ctx.globalAlpha = s.tool === 'highlighter' ? 0.35 : 1;
    ctx.fillStyle = s.color;
    ctx.fill(pathFor(s));
  }
  ctx.globalAlpha = 1;
}

export interface WhiteboardHandle {
  toPng: () => Promise<Blob | null>;
}

interface Props {
  strokes: Stroke[];
  readOnly?: boolean;
  onStroke?: (s: Stroke) => void;
  /** Called with remaining strokes after undo or an eraser hit. */
  onReplace?: (strokes: Stroke[], reason: 'undo' | 'erase' | 'clear') => void;
  className?: string;
  /** Called continuously with the in-progress stroke (live sharing of strokes as they are drawn). */
  onLive?: (s: Stroke) => void;
}

export const Whiteboard = forwardRef<WhiteboardHandle, Props>(function Whiteboard({ strokes, readOnly, onStroke, onReplace, onLive, className }, handle) {
  const tr = useT();
  const canvas = useRef<HTMLCanvasElement>(null);
  const drawing = useRef<Stroke | null>(null);
  const [tool, setTool] = useState<'pen' | 'highlighter' | 'eraser'>('pen');
  const [color, setColor] = useState(COLORS[0]!);
  const [size, setSize] = useState(4);
  const dark = typeof document !== 'undefined' && document.documentElement.dataset.theme === 'dark';
  const bg = dark ? '#1d2435' : '#ffffff';

  const redraw = useCallback(() => {
    const ctx = canvas.current?.getContext('2d');
    if (!ctx) return;
    paint(ctx, drawing.current ? [...strokes, drawing.current] : strokes, bg);
  }, [strokes, bg]);
  useEffect(redraw, [redraw]);

  useImperativeHandle(handle, () => ({
    toPng: () =>
      new Promise((resolve) => {
        const c = document.createElement('canvas');
        c.width = BOARD_W;
        c.height = BOARD_H;
        const ctx = c.getContext('2d')!;
        paint(ctx, strokes, '#ffffff');
        c.toBlob(resolve, 'image/png');
      }),
  }));

  const pos = (e: React.PointerEvent): [number, number, number] => {
    const r = canvas.current!.getBoundingClientRect();
    return [((e.clientX - r.left) / r.width) * BOARD_W, ((e.clientY - r.top) / r.height) * BOARD_H, e.pressure || 0.5];
  };

  const erase = (x: number, y: number) => {
    const ctx = canvas.current!.getContext('2d')!;
    const hit = [...strokes].reverse().findIndex((s) => ctx.isPointInPath(pathFor(s), x, y));
    if (hit >= 0) {
      const index = strokes.length - 1 - hit;
      onReplace?.(
        strokes.filter((_, i) => i !== index),
        'erase',
      );
    }
  };

  return (
    <div className={cx('space-y-2', className)}>
      {!readOnly && (
        <div className="card flex flex-wrap items-center gap-2 p-2" role="toolbar" aria-label={tr.t('workspace.kinds.whiteboard')}>
          {(
            [
              ['pen', PenLine, 'workspace.board.pen'],
              ['highlighter', Highlighter, 'workspace.board.highlighter'],
              ['eraser', Eraser, 'workspace.board.eraser'],
            ] as const
          ).map(([k, I, label]) => (
            <button
              key={k}
              type="button"
              className={cx('icon-btn', tool === k && 'bg-soft text-ink')}
              aria-pressed={tool === k}
              aria-label={tr.t(label)}
              title={tr.t(label)}
              onClick={() => setTool(k)}
            >
              <I className="size-5" />
            </button>
          ))}
          <span className="mx-1 h-6 w-px bg-line" />
          {COLORS.map((c) => (
            <button
              key={c}
              type="button"
              aria-label={c}
              aria-pressed={color === c}
              onClick={() => {
                setColor(c);
                if (tool === 'eraser') setTool('pen');
              }}
              className={cx(
                'size-7 rounded-full border border-line',
                color === c && tool !== 'eraser' && 'ring-2 ring-[var(--primary)] ring-offset-2 ring-offset-[var(--card-solid)]',
              )}
              style={{ background: c }}
            />
          ))}
          <label className="ms-2 flex items-center gap-2 text-sm">
            <span className="sr-only">{tr.t('workspace.board.size')}</span>
            <input
              type="range"
              min={2}
              max={24}
              value={size}
              onChange={(e) => setSize(Number(e.target.value))}
              className="w-24 accent-[var(--primary)]"
              aria-label={tr.t('workspace.board.size')}
            />
          </label>
          <span className="flex-1" />
          <button
            type="button"
            className="icon-btn"
            aria-label={tr.t('workspace.toolbar.undo')}
            disabled={!strokes.length}
            onClick={() => onReplace?.(strokes.slice(0, -1), 'undo')}
          >
            <Undo2 className="size-5 flip-rtl" />
          </button>
          <button
            type="button"
            className="icon-btn text-err"
            aria-label={tr.t('workspace.board.clear')}
            disabled={!strokes.length}
            onClick={() => onReplace?.([], 'clear')}
          >
            <Trash2 className="size-5" />
          </button>
        </div>
      )}
      <canvas
        ref={canvas}
        width={BOARD_W}
        height={BOARD_H}
        className={cx('card aspect-video w-full touch-none', !readOnly && (tool === 'eraser' ? 'cursor-cell' : 'cursor-crosshair'))}
        role="img"
        aria-label={tr.t('workspace.kinds.whiteboard')}
        onPointerDown={(e) => {
          if (readOnly) return;
          e.currentTarget.setPointerCapture(e.pointerId);
          const p = pos(e);
          if (tool === 'eraser') return erase(p[0], p[1]);
          drawing.current = { points: [p], color, size, tool };
          redraw();
        }}
        onPointerMove={(e) => {
          if (readOnly) return;
          const p = pos(e);
          if (tool === 'eraser' && e.buttons) return erase(p[0], p[1]);
          if (!drawing.current) return;
          drawing.current.points.push(p);
          redraw();
          onLive?.(drawing.current);
        }}
        onPointerUp={() => {
          const s = drawing.current;
          drawing.current = null;
          if (s && s.points.length > 1) onStroke?.(s);
          else redraw();
        }}
        onPointerCancel={() => {
          drawing.current = null;
          redraw();
        }}
      />
    </div>
  );
});
