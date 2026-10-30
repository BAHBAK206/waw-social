import { toCsv } from '@qubedu/shared';

/** Saves a blob as a file. The object URL is released a little later (revoking at once can cancel the download). */
export function downloadBlob(blob: Blob, filename: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 30_000);
}

/** CSV that Excel opens as UTF-8 (Arabic names) with formula injection neutralized. */
export function downloadCsv(filename: string, rows: readonly (readonly unknown[])[]) {
  downloadBlob(new Blob([`\uFEFF${toCsv(rows)}`], { type: 'text/csv;charset=utf-8' }), filename);
}
