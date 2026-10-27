/** Helpers for the document format: content is `{ html }` produced by the rich-text editor. */
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function docFromText(text: string): { html: string } {
  const html = text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p>${esc(p).replace(/\n/g, '<br>')}</p>`)
    .join('');
  return { html: html || '<p></p>' };
}

export interface SheetContent {
  rows: number;
  cols: number;
  cells: Record<string, string>;
}
export interface SlideContent {
  slides: { title: string; body: string; bg: string }[];
}
export interface BoardContent {
  strokes: { points: [number, number, number][]; color: string; size: number; tool: 'pen' | 'highlighter' }[];
}

export const emptySheet = (): SheetContent => ({ rows: 30, cols: 10, cells: {} });
export const emptySlides = (): SlideContent => ({ slides: [{ title: '', body: '', bg: '#6c5ce7' }] });
export const emptyBoard = (): BoardContent => ({ strokes: [] });

export function htmlToText(html: string): string {
  const el = document.createElement('div');
  el.innerHTML = html;
  el.querySelectorAll('br').forEach((b) => b.replaceWith('\n'));
  el.querySelectorAll('p,h1,h2,h3,li,blockquote').forEach((n) => n.append('\n'));
  return (el.textContent ?? '').replace(/\n{3,}/g, '\n\n').trim();
}
