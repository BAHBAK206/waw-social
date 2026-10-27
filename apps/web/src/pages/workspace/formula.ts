/**
 * Spreadsheet formula engine: =SUM(A1:A5), =AVERAGE(B1:B3), =A1*2+3, MIN/MAX/COUNT/ROUND/IF/ABS.
 * A small recursive-descent parser — user input is never passed to eval or Function.
 */
export type Cells = Record<string, string>;

export const colName = (i: number): string => {
  let n = i + 1;
  let s = '';
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
};

export const colIndex = (name: string): number => [...name].reduce((a, c) => a * 26 + (c.charCodeAt(0) - 64), 0) - 1;

export const ERR = { div0: '#DIV/0!', ref: '#REF!', name: '#NAME?', value: '#VALUE!', cycle: '#CYCLE!', parse: '#PARSE!' } as const;

type Tok = { t: 'num'; v: number } | { t: 'str'; v: string } | { t: 'id'; v: string } | { t: 'op'; v: string };

function tokenize(src: string): Tok[] {
  const out: Tok[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i]!;
    if (/\s/.test(c)) i++;
    else if (/[0-9.]/.test(c)) {
      let j = i;
      while (j < src.length && /[0-9.]/.test(src[j]!)) j++;
      const v = Number(src.slice(i, j));
      if (Number.isNaN(v)) throw new Error(ERR.parse);
      out.push({ t: 'num', v });
      i = j;
    } else if (/[A-Za-z_$]/.test(c)) {
      let j = i;
      while (j < src.length && /[A-Za-z0-9_$]/.test(src[j]!)) j++;
      out.push({ t: 'id', v: src.slice(i, j).replace(/\$/g, '').toUpperCase() });
      i = j;
    } else if (c === '"') {
      let j = i + 1;
      while (j < src.length && src[j] !== '"') j++;
      out.push({ t: 'str', v: src.slice(i + 1, j) });
      i = j + 1;
    } else if ('+-*/^(),:%'.includes(c)) {
      out.push({ t: 'op', v: c });
      i++;
    } else if ('<>='.includes(c)) {
      const two = src.slice(i, i + 2);
      if (['<=', '>=', '<>'].includes(two)) {
        out.push({ t: 'op', v: two });
        i += 2;
      } else {
        out.push({ t: 'op', v: c });
        i++;
      }
    } else throw new Error(ERR.parse);
  }
  return out;
}

type Value = number | string;

export function createEvaluator(cells: Cells) {
  const cache = new Map<string, Value>();
  const stack = new Set<string>();

  const errors = new Map<string, string>();
  const isErr = (v: string) => (Object.values(ERR) as string[]).includes(v);

  /** Value of a cell; throws the error code for cells that failed so errors propagate through dependents. */
  const cellValue = (ref: string): Value => {
    const failed = errors.get(ref);
    if (failed) throw new Error(failed);
    if (cache.has(ref)) return cache.get(ref)!;
    if (stack.has(ref)) throw new Error(ERR.cycle);
    const raw = cells[ref] ?? '';
    let v: Value;
    if (raw.startsWith('=')) {
      stack.add(ref);
      try {
        v = evaluate(raw.slice(1));
      } catch (e) {
        const code = (e as Error).message;
        errors.set(ref, isErr(code) ? code : ERR.value);
        throw new Error(errors.get(ref));
      } finally {
        stack.delete(ref);
      }
    } else if (raw.trim() !== '' && !Number.isNaN(Number(raw))) v = Number(raw);
    else v = raw;
    cache.set(ref, v);
    return v;
  };

  const rangeValues = (a: string, b: string): Value[] => {
    const ma = /^([A-Z]+)(\d+)$/.exec(a);
    const mb = /^([A-Z]+)(\d+)$/.exec(b);
    if (!ma || !mb) throw new Error(ERR.ref);
    const [c1, c2] = [colIndex(ma[1]!), colIndex(mb[1]!)].sort((x, y) => x - y) as [number, number];
    const [r1, r2] = [Number(ma[2]), Number(mb[2])].sort((x, y) => x - y) as [number, number];
    if ((c2 - c1 + 1) * (r2 - r1 + 1) > 20000) throw new Error(ERR.ref);
    const out: Value[] = [];
    for (let r = r1; r <= r2; r++) for (let c = c1; c <= c2; c++) out.push(cellValue(`${colName(c)}${r}`));
    return out;
  };

  const nums = (vals: Value[]) => vals.filter((v): v is number => typeof v === 'number');
  const FN: Record<string, (args: Value[][]) => Value> = {
    SUM: (a) => nums(a.flat()).reduce((x, y) => x + y, 0),
    AVERAGE: (a) => {
      const n = nums(a.flat());
      if (!n.length) throw new Error(ERR.div0);
      return n.reduce((x, y) => x + y, 0) / n.length;
    },
    MIN: (a) => Math.min(...nums(a.flat())),
    MAX: (a) => Math.max(...nums(a.flat())),
    COUNT: (a) => nums(a.flat()).length,
    ABS: (a) => Math.abs(Number(a[0]?.[0])),
    ROUND: (a) => {
      const d = Number(a[1]?.[0] ?? 0);
      const f = 10 ** d;
      return Math.round(Number(a[0]?.[0]) * f) / f;
    },
    IF: (a) => (a[0]?.[0] && a[0][0] !== 0 ? (a[1]?.[0] ?? '') : (a[2]?.[0] ?? '')),
  };

  function evaluate(src: string): Value {
    const toks = tokenize(src);
    let p = 0;
    const peek = () => toks[p];
    const eat = (v?: string) => {
      const t = toks[p];
      if (!t || (v !== undefined && !(t.t === 'op' && t.v === v))) throw new Error(ERR.parse);
      p++;
      return t;
    };
    const isOp = (v: string) => peek()?.t === 'op' && (peek() as { v: string }).v === v;
    const num = (v: Value): number => {
      if (typeof v === 'number') return v;
      if (v === '') return 0;
      const n = Number(v);
      if (Number.isNaN(n)) throw new Error(ERR.value);
      return n;
    };

    function parseCompare(): Value {
      let l = parseAdd();
      while (peek()?.t === 'op' && ['<', '>', '=', '<=', '>=', '<>'].includes((peek() as { v: string }).v)) {
        const op = (eat() as { v: string }).v;
        const r = parseAdd();
        const [a, b] = typeof l === 'number' && typeof r === 'number' ? [l, r] : [String(l), String(r)];
        l = (op === '<' ? a < b : op === '>' ? a > b : op === '=' ? a === b : op === '<=' ? a <= b : op === '>=' ? a >= b : a !== b) ? 1 : 0;
      }
      return l;
    }
    function parseAdd(): Value {
      let l = parseMul();
      while (isOp('+') || isOp('-')) {
        const op = (eat() as { v: string }).v;
        const r = parseMul();
        l = op === '+' ? num(l) + num(r) : num(l) - num(r);
      }
      return l;
    }
    function parseMul(): Value {
      let l = parsePow();
      while (isOp('*') || isOp('/')) {
        const op = (eat() as { v: string }).v;
        const r = parsePow();
        if (op === '/') {
          if (num(r) === 0) throw new Error(ERR.div0);
          l = num(l) / num(r);
        } else l = num(l) * num(r);
      }
      return l;
    }
    function parsePow(): Value {
      const base = parseUnary();
      if (isOp('^')) {
        eat();
        return num(base) ** num(parsePow());
      }
      return base;
    }
    function parseUnary(): Value {
      if (isOp('-')) {
        eat();
        return -num(parseUnary());
      }
      if (isOp('+')) {
        eat();
        return num(parseUnary());
      }
      let v = parsePrimary();
      while (isOp('%')) {
        eat();
        v = num(v) / 100;
      }
      return v;
    }
    function parseArgs(): Value[][] {
      const args: Value[][] = [];
      eat('(');
      if (!isOp(')')) {
        do {
          args.push(parseArg());
        } while (isOp(',') && eat(','));
      }
      eat(')');
      return args;
    }
    function parseArg(): Value[] {
      const t = peek();
      const n = toks[p + 1];
      if (t?.t === 'id' && /^[A-Z]+\d+$/.test(t.v) && n?.t === 'op' && n.v === ':') {
        p += 2;
        const end = eat0();
        return rangeValues(t.v, end);
      }
      return [parseCompare()];
    }
    function eat0(): string {
      const t = toks[p++];
      if (!t || t.t !== 'id') throw new Error(ERR.parse);
      return t.v;
    }
    function parsePrimary(): Value {
      const t = peek();
      if (!t) throw new Error(ERR.parse);
      if (t.t === 'num') {
        p++;
        return t.v;
      }
      if (t.t === 'str') {
        p++;
        return t.v;
      }
      if (t.t === 'op' && t.v === '(') {
        eat('(');
        const v = parseCompare();
        eat(')');
        return v;
      }
      if (t.t === 'id') {
        p++;
        if (isOp('(')) {
          const fn = FN[t.v];
          if (!fn) throw new Error(ERR.name);
          return fn(parseArgs());
        }
        if (/^[A-Z]+\d+$/.test(t.v)) return cellValue(t.v);
        throw new Error(ERR.name);
      }
      throw new Error(ERR.parse);
    }

    const result = parseCompare();
    if (p < toks.length) throw new Error(ERR.parse);
    return result;
  }

  return {
    /** Display value of a cell ("" for empty). */
    get(ref: string): Value {
      try {
        return cellValue(ref);
      } catch (e) {
        return (e as Error).message.startsWith('#') ? (e as Error).message : ERR.value;
      }
    },
  };
}

export function formatValue(v: Value): string {
  if (typeof v === 'number') return Number.isInteger(v) ? String(v) : String(Math.round(v * 1e10) / 1e10);
  return v;
}
