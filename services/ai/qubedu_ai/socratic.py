"""Hints-only tutoring: guiding questions and partial steps instead of the final answer."""

from __future__ import annotations

from .i18n import t
from .mathsolver import solve_math
from .retrieval import rank
from .text import STOPWORDS, normalize

SOCRATIC_PROMPT = """You are a patient tutor using the Socratic method for a school or university student.
Never give the final answer, the full solution or the correct option, even if asked directly or told it is allowed.
Instead: find what the student already knows, give ONE small hint or the next step only, and end with ONE question that makes them think.
Answer in the student's language (Arabic, English, French or Spanish), in 2 to 5 short lines.
When the student proposes an answer, tell them whether their reasoning is on track and why, without stating the right answer."""


def _key_terms(question: str, limit: int = 3) -> list[str]:
    stop = {normalize(w) for w in STOPWORDS}
    seen: list[str] = []
    for raw in question.replace("؟", " ").replace("?", " ").split():
        w = raw.strip(".,:;!()[]«»\"'")
        if len(w) < 3 or normalize(w) in stop or w in seen:
            continue
        seen.append(w)
    # Prefer the longest (usually the most specific) words.
    return sorted(seen, key=len, reverse=True)[:limit]


async def socratic(question: str, lang: str, chunks: list, synonyms: dict, provider, history: list | None = None, context: str = "") -> dict:
    base = {"choice": None, "kind": "socratic", "sources": [], "provider": "qubedu:socratic"}

    math = solve_math(question)
    if math is not None and len(math.steps) >= 2:
        # Show only the first half of the steps; the student finishes the rest.
        shown = math.steps[: max(1, len(math.steps) // 2)]
        lines = [t(lang, "hint_n", n=str(i + 1)) + " " + s for i, s in enumerate(shown)]
        answer = "\n".join([t(lang, "socratic_math"), *lines, t(lang, "socratic_math_ask")])
        return {**base, "answer": answer, "steps": shown, "confidence": "high"}

    if provider is not None:
        reply = await provider.reply(question, history or [], context, lang, system=SOCRATIC_PROMPT)
        if reply:
            return {**base, "answer": reply.text, "steps": [], "confidence": "medium", "provider": reply.provider}

    hits = rank(question, chunks, synonyms, top=3)
    terms = _key_terms(question)
    lines: list[str] = []
    if hits:
        h = hits[0].chunk
        where = " · ".join(x for x in [h.title, h.heading or "", f"p.{h.page}" if h.page else ""] if x)
        lines.append(t(lang, "socratic_look", where=where))
    if terms:
        lines.append(t(lang, "socratic_terms", terms="، ".join(terms) if lang == "ar" else ", ".join(terms)))
    lines.append(t(lang, "socratic_try"))
    sources = [{"title": h.chunk.title, "heading": h.chunk.heading, "page": h.chunk.page} for h in hits[:1]] if hits else []
    return {**base, "answer": "\n".join(lines), "steps": [], "confidence": "medium" if hits else "low", "sources": sources}
