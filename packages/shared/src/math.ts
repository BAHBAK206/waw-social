/**
 * Math in text: `$x^2$` inline and `$$\frac{a}{b}$$` on its own line (also `\(…\)` and `\[…\]`).
 * A `$` only opens math when the next character is not a space and closes when the previous one is not a space and
 * no digit follows, so prices like "$5 and $10" stay plain text.
 */
export type MathSegment = { kind: 'text'; value: string } | { kind: 'math'; value: string; display: boolean };

const MAX_MATH = 2000;

export function splitMath(text: string): MathSegment[] {
  const out: MathSegment[] = [];
  let buf = '';
  let i = 0;
  const flush = () => {
    if (buf) out.push({ kind: 'text', value: buf });
    buf = '';
  };
  const push = (value: string, display: boolean) => {
    flush();
    out.push({ kind: 'math', value: value.trim(), display });
  };
  while (i < text.length) {
    const ch = text[i]!;
    // An escaped dollar is a dollar sign.
    if (ch === '\\' && text[i + 1] === '$') {
      buf += '$';
      i += 2;
      continue;
    }
    if (ch === '\\' && (text[i + 1] === '(' || text[i + 1] === '[')) {
      const close = text[i + 1] === '(' ? '\\)' : '\\]';
      const end = text.indexOf(close, i + 2);
      if (end > i + 2 && end - i < MAX_MATH) {
        push(text.slice(i + 2, end), close === '\\]');
        i = end + 2;
        continue;
      }
    }
    if (ch === '$' && text[i + 1] === '$') {
      const end = text.indexOf('$$', i + 2);
      if (end > i + 2 && end - i < MAX_MATH && text.slice(i + 2, end).trim()) {
        push(text.slice(i + 2, end), true);
        i = end + 2;
        continue;
      }
    }
    if (ch === '$' && text[i + 1] && !/\s/.test(text[i + 1]!)) {
      let j = i + 1;
      let end = -1;
      while (j < text.length && j - i < MAX_MATH) {
        if (text[j] === '\\') {
          j += 2;
          continue;
        }
        if (text[j] === '\n') break;
        if (text[j] === '$') {
          if (!/\s/.test(text[j - 1]!) && !/\d/.test(text[j + 1] ?? '')) end = j;
          break;
        }
        j++;
      }
      if (end > i + 1) {
        push(text.slice(i + 1, end), false);
        i = end + 1;
        continue;
      }
    }
    buf += ch;
    i++;
  }
  flush();
  return out;
}

export const hasMath = (text: string) => splitMath(text).some((s) => s.kind === 'math');

const SYMBOLS: Record<string, string> = {
  alpha: 'α',
  beta: 'β',
  gamma: 'γ',
  delta: 'δ',
  epsilon: 'ε',
  varepsilon: 'ε',
  zeta: 'ζ',
  eta: 'η',
  theta: 'θ',
  vartheta: 'ϑ',
  iota: 'ι',
  kappa: 'κ',
  lambda: 'λ',
  mu: 'μ',
  nu: 'ν',
  xi: 'ξ',
  pi: 'π',
  rho: 'ρ',
  sigma: 'σ',
  tau: 'τ',
  upsilon: 'υ',
  phi: 'φ',
  varphi: 'φ',
  chi: 'χ',
  psi: 'ψ',
  omega: 'ω',
  Gamma: 'Γ',
  Delta: 'Δ',
  Theta: 'Θ',
  Lambda: 'Λ',
  Xi: 'Ξ',
  Pi: 'Π',
  Sigma: 'Σ',
  Phi: 'Φ',
  Psi: 'Ψ',
  Omega: 'Ω',
  times: '×',
  div: '÷',
  cdot: '·',
  pm: '±',
  mp: '∓',
  le: '≤',
  leq: '≤',
  ge: '≥',
  geq: '≥',
  ne: '≠',
  neq: '≠',
  approx: '≈',
  equiv: '≡',
  sim: '∼',
  propto: '∝',
  infty: '∞',
  to: '→',
  rightarrow: '→',
  leftarrow: '←',
  Rightarrow: '⇒',
  Leftarrow: '⇐',
  leftrightarrow: '↔',
  Leftrightarrow: '⇔',
  implies: '⇒',
  iff: '⇔',
  in: '∈',
  notin: '∉',
  subset: '⊂',
  subseteq: '⊆',
  supset: '⊃',
  cup: '∪',
  cap: '∩',
  emptyset: '∅',
  varnothing: '∅',
  forall: '∀',
  exists: '∃',
  neg: '¬',
  land: '∧',
  lor: '∨',
  partial: '∂',
  nabla: '∇',
  sum: 'Σ',
  prod: 'Π',
  int: '∫',
  iint: '∬',
  oint: '∮',
  angle: '∠',
  degree: '°',
  circ: '∘',
  perp: '⊥',
  parallel: '∥',
  triangle: '△',
  therefore: '∴',
  because: '∵',
  ldots: '…',
  cdots: '⋯',
  dots: '…',
  prime: '′',
  mathbb: '',
  R: 'ℝ',
  N: 'ℕ',
  Z: 'ℤ',
  Q: 'ℚ',
  C: 'ℂ',
  quad: ' ',
  qquad: '  ',
  ',': ' ',
  ';': ' ',
  '!': '',
  ' ': ' ',
  left: '',
  right: '',
  big: '',
  Big: '',
  displaystyle: '',
  lim: 'lim',
  sin: 'sin',
  cos: 'cos',
  tan: 'tan',
  log: 'log',
  ln: 'ln',
  exp: 'exp',
  min: 'min',
  max: 'max',
  '%': '%',
  '{': '{',
  '}': '}',
  _: '_',
  '#': '#',
  '&': '&',
};
const SUP: Record<string, string> = {
  '0': '⁰',
  '1': '¹',
  '2': '²',
  '3': '³',
  '4': '⁴',
  '5': '⁵',
  '6': '⁶',
  '7': '⁷',
  '8': '⁸',
  '9': '⁹',
  '+': '⁺',
  '-': '⁻',
  '=': '⁼',
  '(': '⁽',
  ')': '⁾',
  n: 'ⁿ',
  i: 'ⁱ',
  x: 'ˣ',
  y: 'ʸ',
  a: 'ᵃ',
  b: 'ᵇ',
  c: 'ᶜ',
  d: 'ᵈ',
  e: 'ᵉ',
  k: 'ᵏ',
  m: 'ᵐ',
  t: 'ᵗ',
  '°': '°',
  '∘': '°',
};
const SUB: Record<string, string> = {
  '0': '₀',
  '1': '₁',
  '2': '₂',
  '3': '₃',
  '4': '₄',
  '5': '₅',
  '6': '₆',
  '7': '₇',
  '8': '₈',
  '9': '₉',
  '+': '₊',
  '-': '₋',
  '=': '₌',
  '(': '₍',
  ')': '₎',
  a: 'ₐ',
  e: 'ₑ',
  i: 'ᵢ',
  n: 'ₙ',
  x: 'ₓ',
  o: 'ₒ',
  k: 'ₖ',
  m: 'ₘ',
  t: 'ₜ',
};

/**
 * Readable plain text for a formula (notifications, search, read-aloud, and the app's inline view):
 * `\frac{a}{b}` → (a)/(b), `x^2` → x², `\sqrt{x}` → √(x), Greek letters and operators as symbols.
 */
export function latexToText(tex: string): string {
  let i = 0;
  const group = (): string => {
    while (tex[i] === ' ') i++;
    if (tex[i] === '{') {
      i++;
      let out = '';
      while (i < tex.length && tex[i] !== '}') out += atom();
      i++;
      return out;
    }
    return atom();
  };
  const script = (map: Record<string, string>, mark: string) => {
    const g = group();
    const chars = [...g];
    return chars.every((c) => map[c]) ? chars.map((c) => map[c]).join('') : `${mark}(${g})`;
  };
  const wrap = (s: string) => (s.length > 1 && !/^[\w.]+$/.test(s) ? `(${s})` : s);
  const atom = (): string => {
    const ch = tex[i]!;
    if (ch === '\\') {
      const m = /^\\([A-Za-z]+|.)/.exec(tex.slice(i));
      const name = m?.[1] ?? '';
      i += 1 + name.length;
      if (name === 'frac' || name === 'dfrac' || name === 'tfrac') {
        const a = group();
        const b = group();
        return `${wrap(a)}/${wrap(b)}`;
      }
      if (name === 'sqrt') {
        let root = '';
        if (tex[i] === '[') {
          const end = tex.indexOf(']', i);
          root = tex.slice(i + 1, end);
          i = end + 1;
        }
        const g = group();
        const sup = [...root].every((c) => SUP[c]) ? [...root].map((c) => SUP[c]).join('') : root;
        return `${sup}√${wrap(g)}`;
      }
      if (['text', 'mathrm', 'mathbf', 'mathit', 'operatorname', 'textbf', 'vec', 'overline', 'hat', 'bar', 'mathbb'].includes(name)) {
        const g = group();
        if (name === 'vec') return `${g}⃗`;
        if (name === 'overline' || name === 'bar') return `${g}̅`;
        if (name === 'mathbb') return SYMBOLS[g] ?? g;
        return g;
      }
      return SYMBOLS[name] ?? name;
    }
    i++;
    if (ch === '^') return script(SUP, '^');
    if (ch === '_') return script(SUB, '_');
    if (ch === '{') {
      i--;
      return group();
    }
    if (ch === '}') return '';
    if (ch === '~') return ' ';
    if (ch === '&') return ' ';
    return ch;
  };
  let out = '';
  let guard = 0;
  while (i < tex.length && guard++ < 10_000) out += atom();
  return out.replace(/\s+/g, ' ').trim();
}

/** The whole text with every formula replaced by its readable form. */
export function mathToPlain(text: string): string {
  return splitMath(text)
    .map((s) => (s.kind === 'math' ? latexToText(s.value) : s.value))
    .join('');
}

/** Ready-made formulas for people who don't know LaTeX (label shown on the button, snippet inserted). */
export const MATH_SNIPPETS = [
  { id: 'frac', label: 'a⁄b', snippet: '$\\frac{a}{b}$' },
  { id: 'pow', label: 'x²', snippet: '$x^{2}$' },
  { id: 'sqrt', label: '√x', snippet: '$\\sqrt{x}$' },
  { id: 'sub', label: 'x₁', snippet: '$x_{1}$' },
  { id: 'pi', label: 'π', snippet: '$\\pi$' },
  { id: 'times', label: '×', snippet: '$\\times$' },
  { id: 'le', label: '≤', snippet: '$\\le$' },
  { id: 'ge', label: '≥', snippet: '$\\ge$' },
] as const;
