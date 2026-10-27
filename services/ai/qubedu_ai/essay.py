"""Grades free-text answers by key-point coverage (teacher-authored keys + synonyms)."""

from __future__ import annotations

from dataclasses import dataclass

from .i18n import t
from .text import expand_with_synonyms, sentences, tokens


@dataclass
class PointCoverage:
    point: str
    matched: bool
    evidence: str | None


def grade_essay(answer: str, model_answer: str, key_points: list[str], synonyms: dict[str, list[str]], lang: str) -> dict:
    answer_sentences = sentences(answer) or [answer]
    answer_tokens = set(tokens(answer))
    results: list[PointCoverage] = []
    for point in key_points:
        p = set(expand_with_synonyms(tokens(point), synonyms))
        base = set(tokens(point))
        if not base:
            results.append(PointCoverage(point, False, None))
            continue
        hit_ratio = len(base & answer_tokens) / len(base) if base else 0
        syn_ratio = len(p & answer_tokens) / max(1, len(base))
        matched = hit_ratio >= 0.6 or syn_ratio >= 0.6
        evidence = None
        if matched:
            best = max(answer_sentences, key=lambda s: len(p & set(tokens(s))))
            evidence = best.strip()[:240]
        results.append(PointCoverage(point, matched, evidence))
    matched_n = sum(1 for r in results if r.matched)
    score = round(matched_n / len(results) * 100) if results else 0
    # Small bonus for overall similarity to the model answer, never above 100.
    if model_answer.strip():
        model_tokens = set(tokens(model_answer))
        if model_tokens:
            sim = len(model_tokens & answer_tokens) / len(model_tokens)
            score = min(100, round(score * 0.85 + sim * 100 * 0.15))
    feedback = t(lang, "essay_good") if score >= 80 else t(lang, "essay_partial") if score >= 45 else t(lang, "essay_weak")
    return {
        "score": score,
        "coverage": [{"point": r.point, "matched": r.matched, "evidence": r.evidence} for r in results],
        "feedback": feedback,
    }
