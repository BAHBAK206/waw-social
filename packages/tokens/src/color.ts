export interface Rgba {
  r: number;
  g: number;
  b: number;
  a: number;
}

export function parseColor(input: string): Rgba {
  const s = input.trim();
  if (s.startsWith('#')) {
    const h = s.slice(1);
    const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
    const n = Number.parseInt(full.slice(0, 6), 16);
    const a = full.length === 8 ? Number.parseInt(full.slice(6, 8), 16) / 255 : 1;
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255, a };
  }
  const m = s.match(/rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)/);
  if (!m) throw new Error(`Unsupported color: ${input}`);
  const alpha = m[4] ? (m[4].endsWith('%') ? Number.parseFloat(m[4]) / 100 : Number.parseFloat(m[4])) : 1;
  return { r: Number(m[1]), g: Number(m[2]), b: Number(m[3]), a: alpha };
}

const hex2 = (n: number) => Math.round(Math.max(0, Math.min(255, n))).toString(16).padStart(2, '0');

export function toHex(c: Rgba): string {
  return `#${hex2(c.r)}${hex2(c.g)}${hex2(c.b)}${c.a < 1 ? hex2(c.a * 255) : ''}`;
}

/** Mix `a` into `b` by `weight` (0..1 of a), like CSS color-mix in srgb. */
export function mix(a: string, b: string, weight: number): string {
  const x = parseColor(a);
  const y = parseColor(b);
  return toHex({
    r: x.r * weight + y.r * (1 - weight),
    g: x.g * weight + y.g * (1 - weight),
    b: x.b * weight + y.b * (1 - weight),
    a: x.a * weight + y.a * (1 - weight),
  });
}

export function withAlpha(color: string, alpha: number): string {
  const c = parseColor(color);
  return toHex({ ...c, a: alpha });
}

/** Composite a possibly translucent color over an opaque background. */
export function over(fg: string, bg: string): string {
  const f = parseColor(fg);
  const b = parseColor(bg);
  return toHex({ r: f.r * f.a + b.r * (1 - f.a), g: f.g * f.a + b.g * (1 - f.a), b: f.b * f.a + b.b * (1 - f.a), a: 1 });
}

function luminance(c: Rgba): number {
  const ch = [c.r, c.g, c.b].map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
}

export function contrast(fg: string, bg: string): number {
  const l1 = luminance(parseColor(over(fg, bg)));
  const l2 = luminance(parseColor(bg));
  const [hi, lo] = l1 > l2 ? [l1, l2] : [l2, l1];
  return (hi + 0.05) / (lo + 0.05);
}
