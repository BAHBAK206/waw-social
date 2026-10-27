import { ChevronLeft, ChevronRight, Maximize, Plus, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '@/components/ui/Button';
import { Input, Textarea } from '@/components/ui/Field';
import { cx } from '@/lib/cx';
import { useT } from '@/lib/i18n';
import type { SlideContent } from './docs';

const BGS = ['#6c5ce7', '#0984e3', '#00b894', '#e17055', '#2d3436', '#e84393', '#fdcb6e', '#ffffff'];
const inkOn = (bg: string) => {
  const n = parseInt(bg.slice(1), 16);
  const l = (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
  return l > 0.6 ? '#111827' : '#ffffff';
};

export function SlideView({ slide, className }: { slide: SlideContent['slides'][number]; className?: string }) {
  const ink = inkOn(slide.bg);
  return (
    <div className={cx('flex aspect-video flex-col justify-center overflow-hidden p-[5%]', className)} style={{ background: slide.bg, color: ink }} dir="auto">
      <h2 className="text-[clamp(1.1rem,4.5cqw,3rem)] leading-tight font-black" style={{ containerType: 'inline-size' }}>
        {slide.title}
      </h2>
      <ul className="mt-[3%] list-disc space-y-[1%] ps-[6%] text-[clamp(0.8rem,2.6cqw,1.7rem)]">
        {slide.body
          .split('\n')
          .filter(Boolean)
          .map((l, i) => (
            <li key={i}>{l}</li>
          ))}
      </ul>
    </div>
  );
}

function Presenter({ slides, start, onClose }: { slides: SlideContent['slides']; start: number; onClose: () => void }) {
  const [i, setI] = useState(start);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (['ArrowRight', 'ArrowDown', ' ', 'PageDown'].includes(e.key)) setI((x) => Math.min(slides.length - 1, x + 1));
      else if (['ArrowLeft', 'ArrowUp', 'PageUp'].includes(e.key)) setI((x) => Math.max(0, x - 1));
    };
    window.addEventListener('keydown', onKey);
    void document.documentElement.requestFullscreen?.().catch(() => undefined);
    return () => {
      window.removeEventListener('keydown', onKey);
      if (document.fullscreenElement) void document.exitFullscreen();
    };
  }, [slides.length, onClose]);
  return createPortal(
    <div
      className="fixed inset-0 z-[95] grid place-items-center bg-black"
      onClick={() => setI((x) => Math.min(slides.length - 1, x + 1))}
      role="dialog"
      aria-modal="true"
    >
      <SlideView slide={slides[i]!} className="max-h-full w-full max-w-[177vh]" />
      <button
        type="button"
        className="icon-btn absolute end-3 top-3 bg-white/20 text-white"
        aria-label="Close"
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
      >
        ✕
      </button>
      <span className="absolute bottom-3 text-sm text-white/70 tabular-nums">
        {i + 1} / {slides.length}
      </span>
    </div>,
    document.body,
  );
}

export function SlidesEditor({ value, onChange }: { value: SlideContent; onChange: (v: SlideContent) => void }) {
  const tr = useT();
  const [i, setI] = useState(0);
  const [presenting, setPresenting] = useState(false);
  const slide = value.slides[Math.min(i, value.slides.length - 1)]!;
  const idx = Math.min(i, value.slides.length - 1);
  const patch = (p: Partial<typeof slide>) => onChange({ slides: value.slides.map((s, k) => (k === idx ? { ...s, ...p } : s)) });
  return (
    <div className="grid gap-4 lg:grid-cols-[11rem_minmax(0,1fr)]">
      <aside className="card scroll-thin flex gap-2 overflow-auto p-2 lg:max-h-[70vh] lg:flex-col" aria-label={tr.t('workspace.kinds.slides')}>
        {value.slides.map((s, k) => (
          <button
            key={k}
            type="button"
            onClick={() => setI(k)}
            aria-current={k === idx}
            className={cx('w-36 shrink-0 overflow-hidden rounded-lg border-2 lg:w-full', k === idx ? 'border-primary' : 'border-transparent')}
          >
            <SlideView slide={s} className="pointer-events-none !p-[6%] text-[6px]" />
            <span className="muted block py-0.5 text-center text-xs">{tr.t('workspace.slides.slideN', { n: k + 1 })}</span>
          </button>
        ))}
        <Button
          size="sm"
          variant="soft"
          icon={<Plus className="size-4" />}
          className="shrink-0"
          onClick={() => {
            onChange({ slides: [...value.slides, { title: '', body: '', bg: slide.bg }] });
            setI(value.slides.length);
          }}
        >
          {tr.t('workspace.slides.addSlide')}
        </Button>
      </aside>
      <div className="space-y-4">
        <div className="card overflow-hidden">
          <SlideView slide={slide} />
        </div>
        <div className="card space-y-3 p-4">
          <Input label={tr.t('workspace.slides.titlePlaceholder')} value={slide.title} onChange={(e) => patch({ title: e.target.value })} />
          <Textarea label={tr.t('workspace.slides.bodyPlaceholder')} value={slide.body} onChange={(e) => patch({ body: e.target.value })} />
          <div>
            <p className="field-label">{tr.t('workspace.slides.background')}</p>
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={tr.t('workspace.slides.background')}>
              {BGS.map((c) => (
                <button
                  key={c}
                  type="button"
                  role="radio"
                  aria-checked={slide.bg === c}
                  aria-label={c}
                  onClick={() => patch({ bg: c })}
                  className={cx(
                    'size-8 rounded-full border border-line',
                    slide.bg === c && 'ring-2 ring-[var(--primary)] ring-offset-2 ring-offset-[var(--card-solid)]',
                  )}
                  style={{ background: c }}
                />
              ))}
            </div>
          </div>
          <div className="flex flex-wrap gap-2 pt-1">
            <Button variant="outline" size="sm" icon={<ChevronLeft className="size-4 flip-rtl" />} disabled={idx === 0} onClick={() => setI(idx - 1)}>
              {tr.t('common.previous')}
            </Button>
            <Button
              variant="outline"
              size="sm"
              icon={<ChevronRight className="size-4 flip-rtl" />}
              disabled={idx === value.slides.length - 1}
              onClick={() => setI(idx + 1)}
            >
              {tr.t('common.next')}
            </Button>
            <Button size="sm" icon={<Maximize className="size-4" />} onClick={() => setPresenting(true)}>
              {tr.t('workspace.slides.present')}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="ms-auto text-err"
              icon={<Trash2 className="size-4" />}
              disabled={value.slides.length === 1}
              onClick={() => {
                onChange({ slides: value.slides.filter((_, k) => k !== idx) });
                setI(Math.max(0, idx - 1));
              }}
            >
              {tr.t('common.delete')}
            </Button>
          </div>
        </div>
      </div>
      {presenting && <Presenter slides={value.slides} start={idx} onClose={() => setPresenting(false)} />}
    </div>
  );
}
