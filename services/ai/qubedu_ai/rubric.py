"""Feedback on a piece of writing against a teacher's rubric (criteria with levels)."""

from __future__ import annotations

import json
import re

from .i18n import t
from .text import STOPWORDS, normalize, stem, tokens

RUBRIC_INSTRUCTION = """Assess the student's text against the rubric. For every criterion choose the level that fits best and write one short, kind, specific comment (what is good, and one thing to improve).
Reply with JSON only: {"criteria": [{"index": 0, "level": 0, "comment": "..."}], "overall": "..."} where "level" is the index of the chosen level in that criterion's list.
Write the comments in the language given in <language>."""


def _stats(text: str) -> dict:
    words = len(text.split())
    sents = [s for s in re.split(r"[.!?؟]+(?:\s|$)", text) if len(s.strip()) > 1]
    paras = [p for p in re.split(r"\n\s*\n", text) if p.strip()]
    return {"words": words, "sentences": len(sents), "paragraphs": len(paras), "avgSentence": round(words / len(sents), 1) if sents else 0}


def _keywords(text: str) -> list[tuple[str, str]]:
    """(stem, original word) pairs for the meaningful words of a criterion."""
    stop = {normalize(w) for w in STOPWORDS}
    out: dict[str, str] = {}
    for raw in re.findall(r"[\w؀-ۿ]+", text):
        n = normalize(raw)
        if len(n) < 3 or n in stop or n.isdigit():
            continue
        out.setdefault(stem(n), raw)
    return list(out.items())


def _heuristic(text: str, criteria: list[dict], lang: str) -> list[dict]:
    have = set(tokens(text))
    stats = _stats(text)
    length = min(1.0, stats["words"] / 120)
    out = []
    for i, c in enumerate(criteria):
        kws = _keywords(f"{c.get('title', '')} {c.get('description', '')}")
        found = [w for s, w in kws if s in have]
        missing = [w for s, w in kws if s not in have][:5]
        cov = len(found) / len(kws) if kws else length
        score = 0.65 * cov + 0.35 * length
        levels = sorted(enumerate(c.get("levels") or []), key=lambda x: x[1].get("points", 0))
        level = levels[min(len(levels) - 1, round(score * (len(levels) - 1)))][0] if levels else None
        title = c.get("title", "")
        if score >= 0.75:
            comment = t(lang, "rubric_strong", title=title)
        elif score >= 0.4:
            comment = t(lang, "rubric_partial", title=title, missing=", ".join(missing[:3]) or "—")
        else:
            comment = t(lang, "rubric_weak", title=title, missing=", ".join(missing[:3]) or "—")
        out.append({"index": i, "level": level, "comment": comment, "found": found[:8], "missing": missing})
    return out


def _overall(stats: dict, criteria: list[dict], lang: str) -> str:
    tips = []
    if stats["words"] < 60:
        tips.append(t(lang, "rubric_short"))
    if stats["words"] > 150 and stats["paragraphs"] < 2:
        tips.append(t(lang, "rubric_paragraphs"))
    if stats["avgSentence"] > 30:
        tips.append(t(lang, "rubric_long_sentences"))
    return " ".join(tips) or t(lang, "rubric_overall_ok")


async def rubric_feedback(text: str, criteria: list[dict], lang: str, provider=None) -> dict:
    stats = _stats(text)
    heur = _heuristic(text, criteria, lang)
    result = {"criteria": heur, "overall": _overall(stats, criteria, lang), "stats": stats, "provider": "qubedu"}
    if provider is None:
        return result
    rubric = json.dumps(
        [
            {"index": i, "title": c.get("title"), "description": c.get("description", ""), "levels": [lv.get("label") for lv in c.get("levels") or []]}
            for i, c in enumerate(criteria)
        ],
        ensure_ascii=False,
    )
    reply = await provider.task(RUBRIC_INSTRUCTION, f"<language>{lang}</language>\n<rubric>{rubric}</rubric>\n<text>\n{text[:15000]}\n</text>")
    if not reply:
        return result
    try:
        raw = reply.text[reply.text.index("{") : reply.text.rindex("}") + 1]
        data = json.loads(raw)
        by_index = {int(x["index"]): x for x in data.get("criteria", []) if isinstance(x, dict) and "index" in x}
        for c in heur:
            got = by_index.get(c["index"])
            levels = criteria[c["index"]].get("levels") or []
            if got and isinstance(got.get("level"), int) and 0 <= got["level"] < len(levels):
                c["level"] = got["level"]
                c["comment"] = str(got.get("comment") or c["comment"])[:600]
        result["overall"] = str(data.get("overall") or result["overall"])[:1000]
        result["provider"] = reply.provider
    except (ValueError, KeyError, TypeError):
        pass
    return result
