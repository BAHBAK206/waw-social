import type { Editor } from '@tiptap/react';
import type { WhiteboardHandle } from '@/components/common/Whiteboard';
import { downloadBlob } from '@/lib/api';
import { htmlToText, type SheetContent, type SlideContent } from './docs';
import { colName, createEvaluator, formatValue } from './formula';

export type ExportFormat = 'docx' | 'html' | 'txt' | 'pdf' | 'xlsx' | 'csv' | 'pptx' | 'png';

interface Source {
  title: string;
  content: unknown;
  editor: Editor | null;
  board: WhiteboardHandle | null;
}

const safeName = (t: string) =>
  t
    .replace(/[\\/:*?"<>|]+/g, '_')
    .trim()
    .slice(0, 80) || 'file';
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Prints HTML through a hidden iframe so the user can "Save as PDF" without leaving the page. */
function printHtml(html: string) {
  const frame = document.createElement('iframe');
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0';
  document.body.appendChild(frame);
  const d = frame.contentDocument!;
  d.open();
  d.write(html);
  d.close();
  frame.onload = () => {
    frame.contentWindow?.focus();
    frame.contentWindow?.print();
    setTimeout(() => frame.remove(), 2000);
  };
}

const PRINT_CSS =
  'body{font-family:system-ui,sans-serif;line-height:1.7;margin:2cm}h1,h2{margin:1em 0 .4em}blockquote{border-inline-start:4px solid #6c5ce7;padding-inline-start:12px;color:#555}pre,code{background:#f3f3f7;border-radius:4px}pre{padding:10px}@page{margin:1.5cm}.slide{page-break-after:always;aspect-ratio:16/9;padding:6%;display:flex;flex-direction:column;justify-content:center;box-sizing:border-box;margin:0}';

async function docToDocx(html: string, title: string) {
  const docx = await import('docx');
  const root = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html').body;
  type Run = InstanceType<typeof docx.TextRun>;
  const runs = (node: Node, style: { bold?: boolean; italics?: boolean; underline?: boolean; strike?: boolean; code?: boolean } = {}): Run[] => {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent ?? '';
      return text
        ? [
            new docx.TextRun({
              text,
              bold: style.bold,
              italics: style.italics,
              strike: style.strike,
              underline: style.underline ? {} : undefined,
              font: style.code ? 'Consolas' : undefined,
            }),
          ]
        : [];
    }
    const el = node as HTMLElement;
    if (el.tagName === 'BR') return [new docx.TextRun({ break: 1 })];
    const next = {
      ...style,
      bold: style.bold || ['STRONG', 'B'].includes(el.tagName),
      italics: style.italics || ['EM', 'I'].includes(el.tagName),
      underline: style.underline || el.tagName === 'U',
      strike: style.strike || ['S', 'DEL'].includes(el.tagName),
      code: style.code || el.tagName === 'CODE',
    };
    return [...el.childNodes].flatMap((c) => runs(c, next));
  };
  const align = (el: HTMLElement) =>
    ({ center: docx.AlignmentType.CENTER, right: docx.AlignmentType.RIGHT, left: docx.AlignmentType.LEFT })[
      el.style.textAlign as 'center' | 'right' | 'left'
    ] ?? undefined;
  const blocks: InstanceType<typeof docx.Paragraph>[] = [];
  const walk = (el: HTMLElement, list?: { ordered: boolean; level: number }) => {
    for (const child of [...el.children] as HTMLElement[]) {
      const tag = child.tagName;
      if (tag === 'H1' || tag === 'H2' || tag === 'H3')
        blocks.push(
          new docx.Paragraph({
            heading: tag === 'H1' ? docx.HeadingLevel.HEADING_1 : tag === 'H2' ? docx.HeadingLevel.HEADING_2 : docx.HeadingLevel.HEADING_3,
            children: runs(child),
            alignment: align(child),
          }),
        );
      else if (tag === 'UL' || tag === 'OL') walk(child, { ordered: tag === 'OL', level: (list?.level ?? -1) + 1 });
      else if (tag === 'LI') {
        const own = [...child.childNodes].filter((n) => !(n instanceof HTMLElement && ['UL', 'OL'].includes(n.tagName)));
        blocks.push(
          new docx.Paragraph({
            children: own.flatMap((n) => runs(n)),
            ...(list?.ordered
              ? { numbering: { reference: 'qubedu-numbering', level: Math.min(list.level, 5) } }
              : { bullet: { level: Math.min(list?.level ?? 0, 5) } }),
          }),
        );
        walk(child, list);
      } else if (tag === 'BLOCKQUOTE') blocks.push(new docx.Paragraph({ children: runs(child, { italics: true }), indent: { left: 540 } }));
      else if (tag === 'PRE') blocks.push(new docx.Paragraph({ children: [new docx.TextRun({ text: child.textContent ?? '', font: 'Consolas' })] }));
      else blocks.push(new docx.Paragraph({ children: runs(child), alignment: align(child) }));
    }
  };
  walk(root);
  const document_ = new docx.Document({
    title,
    numbering: {
      config: [
        {
          reference: 'qubedu-numbering',
          levels: [0, 1, 2, 3, 4, 5].map((level) => ({ level, format: docx.LevelFormat.DECIMAL, text: `%${level + 1}.`, alignment: docx.AlignmentType.START })),
        },
      ],
    },
    sections: [{ children: blocks.length ? blocks : [new docx.Paragraph('')] }],
  });
  return docx.Packer.toBlob(document_);
}

export async function exportFile(format: ExportFormat, src: Source): Promise<void> {
  const name = safeName(src.title);
  if (format === 'png') {
    const blob = await src.board?.toPng();
    if (blob) downloadBlob(blob, `${name}.png`);
    return;
  }
  if (src.content && 'html' in (src.content as object)) {
    const html = src.editor?.getHTML() ?? (src.content as { html: string }).html;
    if (format === 'html')
      return downloadBlob(
        new Blob([`<!doctype html><meta charset="utf-8"><title>${esc(src.title)}</title><style>${PRINT_CSS}</style>${html}`], { type: 'text/html' }),
        `${name}.html`,
      );
    if (format === 'txt') return downloadBlob(new Blob([htmlToText(html)], { type: 'text/plain;charset=utf-8' }), `${name}.txt`);
    if (format === 'pdf')
      return printHtml(`<!doctype html><meta charset="utf-8"><title>${esc(src.title)}</title><style>${PRINT_CSS}</style><h1>${esc(src.title)}</h1>${html}`);
    if (format === 'docx') return downloadBlob(await docToDocx(html, src.title), `${name}.docx`);
  }
  if (src.content && 'cells' in (src.content as object)) {
    const sheet = src.content as SheetContent;
    const ev = createEvaluator(sheet.cells);
    // Used range only, so exports are not padded with empty rows.
    let maxR = 0;
    let maxC = 0;
    for (const k of Object.keys(sheet.cells)) {
      const m = /^([A-Z]+)(\d+)$/.exec(k);
      if (m) {
        maxR = Math.max(maxR, Number(m[2]));
        maxC = Math.max(
          maxC,
          [...m[1]!].reduce((a, c) => a * 26 + c.charCodeAt(0) - 64, 0),
        );
      }
    }
    const grid = Array.from({ length: maxR }, (_, r) => Array.from({ length: maxC }, (_, c) => ev.get(`${colName(c)}${r + 1}`)));
    const safe = (v: string | number) => (typeof v === 'string' && /^[=+\-@\t\r]/.test(v) ? `'${v}` : v);
    if (format === 'csv') {
      const csv = grid.map((row) => row.map((v) => `"${String(safe(typeof v === 'number' ? formatValue(v) : v)).replace(/"/g, '""')}"`).join(',')).join('\r\n');
      return downloadBlob(new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' }), `${name}.csv`);
    }
    if (format === 'xlsx') {
      const { default: ExcelJS } = await import('exceljs');
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet('Sheet1');
      for (const row of grid) ws.addRow(row.map((v) => safe(v)));
      return downloadBlob(
        new Blob([await wb.xlsx.writeBuffer()], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
        `${name}.xlsx`,
      );
    }
  }
  if (src.content && 'slides' in (src.content as object)) {
    const { slides } = src.content as SlideContent;
    if (format === 'pdf')
      return printHtml(
        `<!doctype html><meta charset="utf-8"><title>${esc(src.title)}</title><style>${PRINT_CSS}body{margin:0}</style>${slides
          .map((s) => {
            const n = parseInt(s.bg.slice(1), 16);
            const ink = (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255 > 0.6 ? '#111827' : '#fff';
            return `<section class="slide" style="background:${esc(s.bg)};color:${ink}"><h1 style="font-size:40px;margin:0 0 16px">${esc(s.title)}</h1><ul style="font-size:22px">${s.body
              .split('\n')
              .filter(Boolean)
              .map((l) => `<li>${esc(l)}</li>`)
              .join('')}</ul></section>`;
          })
          .join('')}`,
      );
    if (format === 'pptx') {
      const { default: PptxGenJS } = await import('pptxgenjs');
      const pptx = new PptxGenJS();
      pptx.title = src.title;
      for (const s of slides) {
        const slide = pptx.addSlide();
        const n = parseInt(s.bg.slice(1), 16);
        const ink = (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255 > 0.6 ? '111827' : 'FFFFFF';
        slide.background = { color: s.bg.slice(1) };
        slide.addText(s.title, { x: 0.6, y: 0.5, w: 12, h: 1.2, fontSize: 36, bold: true, color: ink });
        slide.addText(
          s.body
            .split('\n')
            .filter(Boolean)
            .map((t) => ({ text: t, options: { bullet: true, breakLine: true } })),
          { x: 0.8, y: 1.9, w: 11.5, h: 4.5, fontSize: 22, color: ink, valign: 'top' },
        );
      }
      const blob = (await pptx.write({ outputType: 'blob' })) as Blob;
      return downloadBlob(blob, `${name}.pptx`);
    }
  }
  throw new Error('unsupported_export');
}
