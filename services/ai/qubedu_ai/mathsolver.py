"""Safe math solving with SymPy: arithmetic, equations, derivatives, integrals, simplify/factor, percentages.

Input is reduced to a strict character whitelist before parsing, so no arbitrary code can reach SymPy's parser.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field

import sympy as sp
from sympy.parsing.sympy_parser import (
    convert_xor,
    implicit_multiplication_application,
    parse_expr,
    standard_transformations,
)

X, Y, Z = sp.symbols("x y z")
_LOCALS = {
    "x": X,
    "y": Y,
    "z": Z,
    "sin": sp.sin,
    "cos": sp.cos,
    "tan": sp.tan,
    "sqrt": sp.sqrt,
    "log": sp.log,
    "ln": sp.log,
    "exp": sp.exp,
    "pi": sp.pi,
    "e": sp.E,
    "abs": sp.Abs,
}
_TRANSFORMS = standard_transformations + (implicit_multiplication_application, convert_xor)
_ALLOWED = re.compile(r"^[0-9a-z+\-*/^().,=\s]+$")
_ALLOWED_WORDS = {"x", "y", "z", "sin", "cos", "tan", "sqrt", "log", "ln", "exp", "pi", "e", "abs"}


@dataclass
class MathResult:
    answer: str
    steps: list[str] = field(default_factory=list)
    value: sp.Expr | None = None
    kind: str = "math"


_SYMBOLS = {"×": "*", "÷": "/", "−": "-", "–": "-", "٫": ".", "،": ",", "√": " sqrt", "π": " pi ", "²": "^2", "³": "^3"}
# Arabic variable/function names, replaced only when they stand alone (not inside a word like «السؤال»).
_AR_WORDS = {"جتا": "cos", "جا": "sin", "ظا": "tan", "لو": "log", "جذر": "sqrt", "س": "x", "ص": "y", "ع": "z"}
_AR_LETTER = "؀-ۿ"

_KEYWORDS = {
    "derivative": ("مشتقة", "مشتقه", "اشتق", "اشتقاق", "derivative", "differentiate", "dérivée", "derivada", "d/dx"),
    "integral": ("تكامل", "integral", "integrate", "intégrale", "integral de", "∫"),
    "simplify": ("بسط", "تبسيط", "simplify", "simplifier", "simplificar"),
    "factor": ("حلل", "تحليل", "factor", "factorise", "factorize", "factoriser", "factorizar"),
    "solve": ("حل المعادلة", "حل", "solve", "résoudre", "resolver", "أوجد قيمة", "اوجد قيمة", "find x"),
}


def _translate(text: str) -> str:
    t = text.translate(str.maketrans("٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹", "01234567890123456789"))
    for k, v in _SYMBOLS.items():
        t = t.replace(k, v)
    for k, v in _AR_WORDS.items():
        t = re.sub(rf"(?<![{_AR_LETTER}]){k}(?![{_AR_LETTER}])", f" {v} ", t)
    return t


def _detect_op(text: str) -> str | None:
    low = text.lower()
    for op, words in _KEYWORDS.items():
        if any(w in low for w in words):
            return op
    return None


def _extract_formula(text: str) -> str | None:
    """Pulls the mathematical part out of a natural-language question."""
    t = _translate(text).lower()
    t = re.sub(r"\b(f\s*\(\s*x\s*\)|y)\s*=", " ", t) if re.search(r"(derivative|integral|مشتق|تكامل)", text.lower()) else t
    # keep only math-looking characters, collapse the rest
    candidate = re.sub(r"[^0-9a-z+\-*/^().,=\s]", " ", t)
    words = re.findall(r"[a-z]+", candidate)
    for w in words:
        if w not in _ALLOWED_WORDS:
            candidate = re.sub(rf"\b{w}\b", " ", candidate)
    candidate = re.sub(r"\s+", " ", candidate).strip(" ,.")
    if not candidate or not re.search(r"\d|[xyz]", candidate):
        return None
    if not re.search(r"[+\-*/^=()]|sqrt|sin|cos|tan|log|exp|\d\s*[xyz]|[xyz]\s*\d", candidate):
        return None
    return candidate


def _safe(expr: str) -> bool:
    if len(expr) > 200 or not _ALLOWED.match(expr):
        return False
    if "__" in expr or re.search(r"\*\*\s*\(?\s*\d{3,}", expr) or re.search(r"\^\s*\(?\s*\d{3,}", expr):
        return False
    if len(re.findall(r"\^|\*\*", expr)) > 4:
        return False
    return True


def _parse(expr: str) -> sp.Expr:
    if not _safe(expr):
        raise ValueError("unsafe")
    return parse_expr(expr.replace(",", ""), local_dict=_LOCALS, transformations=_TRANSFORMS, evaluate=True)


def fmt(v: sp.Expr) -> str:
    v = sp.nsimplify(v, rational=False) if isinstance(v, sp.Float) else v
    if v.is_Integer:
        return str(int(v))
    if v.is_Rational:
        return f"{v.p}/{v.q} ≈ {float(v):.6g}"
    if v.is_number:
        exact = sp.simplify(v)
        num = float(sp.N(exact)) if exact.is_real else complex(sp.N(exact))
        text = str(exact).replace("**", "^").replace("sqrt", "√")
        return text if isinstance(num, complex) or str(exact) == f"{num:g}" else f"{text} ≈ {num:.6g}"
    return str(v).replace("**", "^")


def _percent(text: str) -> MathResult | None:
    t = _translate(text)
    m = re.search(r"(\d+(?:\.\d+)?)\s*[%٪]\s*(?:of|من|de|del)?\s*(\d+(?:\.\d+)?)", t)
    if not m:
        return None
    p, base = sp.Rational(m.group(1)), sp.Rational(m.group(2))
    val = p / 100 * base
    return MathResult(answer=fmt(val), steps=[f"{m.group(1)}% × {m.group(2)}", f"= {m.group(1)}/100 × {m.group(2)}", f"= {fmt(val)}"], value=val)


def solve_math(question: str) -> MathResult | None:
    """Returns None when the question is not (safely) solvable as math."""
    pct = _percent(question)
    if pct:
        return pct
    op = _detect_op(question)
    formula = _extract_formula(question)
    if not formula:
        return None
    try:
        if "=" in formula:
            left, _, right = formula.partition("=")
            if "=" in right:
                return None
            lhs, rhs = _parse(left), _parse(right)
            syms = sorted((lhs - rhs).free_symbols, key=str)
            if not syms:
                ok = sp.simplify(lhs - rhs) == 0
                return MathResult(
                    answer="✓" if ok else "✗", steps=[f"{fmt(lhs)} {'=' if ok else '≠'} {fmt(rhs)}"], value=sp.Integer(1 if ok else 0), kind="math"
                )
            var = X if X in syms else syms[0]
            expr = sp.expand(lhs - rhs)
            sols = sp.solve(sp.Eq(lhs, rhs), var)
            steps = [f"{fmt(lhs)} = {fmt(rhs)}", f"{fmt(expr)} = 0"]
            poly = sp.Poly(expr, var) if expr.is_polynomial(var) else None
            if poly is not None and poly.degree() == 1:
                a, b = poly.all_coeffs()
                steps += [f"{fmt(a)}·{var} = {fmt(-b)}", f"{var} = {fmt(-b)} ÷ {fmt(a)}"]
            elif poly is not None and poly.degree() == 2:
                a, b, c = poly.all_coeffs()
                disc = sp.simplify(b**2 - 4 * a * c)
                steps += [f"a={fmt(a)}, b={fmt(b)}, c={fmt(c)}", f"Δ = b² − 4ac = {fmt(disc)}", f"{var} = (−b ± √Δ) / 2a"]
            if not sols:
                return MathResult(answer="∅", steps=steps + ["no solution"], value=None)
            answer = ", ".join(f"{var} = {fmt(s)}" for s in sols)
            steps.append(answer)
            return MathResult(answer=answer, steps=steps, value=sols[0] if len(sols) == 1 else None)

        expr = _parse(formula)
        var = X if X in expr.free_symbols else (sorted(expr.free_symbols, key=str)[0] if expr.free_symbols else None)
        if op == "derivative" and var is not None:
            d = sp.diff(expr, var)
            return MathResult(answer=fmt(sp.simplify(d)), steps=[f"d/d{var} [{fmt(expr)}]", fmt(sp.simplify(d))], value=d)
        if op == "integral" and var is not None:
            i = sp.integrate(expr, var)
            return MathResult(answer=f"{fmt(i)} + C", steps=[f"∫ {fmt(expr)} d{var}", f"{fmt(i)} + C"], value=i)
        if op == "factor":
            f = sp.factor(expr)
            return MathResult(answer=fmt(f), steps=[fmt(expr), f"= {fmt(f)}"], value=f)
        if op == "simplify" or expr.free_symbols:
            s = sp.simplify(expr)
            return MathResult(answer=fmt(s), steps=[fmt(expr), f"= {fmt(s)}"], value=s)
        val = sp.simplify(expr)
        if not val.is_number:
            return None
        return MathResult(answer=fmt(val), steps=[formula.replace("**", "^"), f"= {fmt(val)}"], value=val)
    except (ValueError, TypeError, SyntaxError, sp.SympifyError, NotImplementedError, ZeroDivisionError, AttributeError):
        return None


def option_matches(option: str, value: sp.Expr | None) -> bool:
    """True when a multiple-choice option equals the computed numeric value."""
    if value is None:
        return False
    formula = _extract_formula(option) or _translate(option).strip()
    try:
        ov = _parse(re.sub(r"^[xyz]\s*=\s*", "", formula))
        diff = sp.N(ov - value)
        return bool(diff.is_number and abs(complex(diff)) < 1e-9)
    except (ValueError, TypeError, SyntaxError, sp.SympifyError, AttributeError):
        return False
