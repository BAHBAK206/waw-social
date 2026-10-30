import { latexToText, splitMath } from '@qubedu/shared';
import type KatexModule from 'katex';
import { Fragment, useEffect, useMemo, useState, type ReactNode } from 'react';

type Katex = typeof KatexModule;
let katex: Katex | null = null;
let loading: Promise<Katex> | null = null;

/** KaTeX (and its stylesheet) loads only on pages that show a formula. */
function useKatex(): Katex | null {
  const [k, setK] = useState<Katex | null>(katex);
  useEffect(() => {
    if (k) return;
    let live = true;
    loading ??= Promise.all([import('katex'), import('katex/dist/katex.min.css')]).then(([m]) => (katex = m.default));
    void loading.then((m) => live && setK(() => m));
    return () => {
      live = false;
    };
  }, [k]);
  return k;
}

/** One formula. KaTeX escapes everything and `trust: false` blocks links and HTML commands, so its output is safe. */
export function Formula({ tex, display = false }: { tex: string; display?: boolean }) {
  const k = useKatex();
  const html = useMemo(() => {
    if (!k) return null;
    try {
      return k.renderToString(tex, {
        displayMode: display,
        throwOnError: false,
        trust: false,
        strict: 'ignore',
        maxSize: 20,
        maxExpand: 200,
        output: 'htmlAndMathml',
      });
    } catch {
      return null;
    }
  }, [k, tex, display]);
  const cls = display ? 'my-2 block overflow-x-auto overflow-y-hidden text-center' : 'inline-block max-w-full overflow-x-auto align-middle';
  if (!html)
    return (
      <span className={cls} dir="ltr" role="math" aria-label={latexToText(tex)}>
        <span className="font-serif italic">{latexToText(tex)}</span>
      </span>
    );
  // KaTeX output with trust disabled (see above).
  return <span className={cls} dir="ltr" dangerouslySetInnerHTML={{ __html: html }} />;
}

/** Text with `$…$` / `$$…$$` formulas. `renderText` formats the plain parts (links, hashtags). */
export function MathText({ text, renderText }: { text: string; renderText?: (part: string, key: number) => ReactNode }) {
  const parts = useMemo(() => splitMath(text), [text]);
  return (
    <>
      {parts.map((p, i) =>
        p.kind === 'math' ? (
          <Formula key={i} tex={p.value} display={p.display} />
        ) : (
          <Fragment key={i}>{renderText ? renderText(p.value, i) : p.value}</Fragment>
        ),
      )}
    </>
  );
}
