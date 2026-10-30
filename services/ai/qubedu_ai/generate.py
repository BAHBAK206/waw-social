"""Deterministic study helpers: extractive summaries and cloze-style quiz generation."""

from __future__ import annotations

import hashlib
import re
from collections import Counter

from .text import STOPWORDS, normalize, sentences, stem, tokens

_WORD = re.compile(r"\w+", re.UNICODE)


def summarize(text: str, max_sentences: int = 5) -> list[str]:
    sents = sentences(text)
    if len(sents) <= max_sentences:
        return sents
    freq = Counter(tokens(text))
    if not freq:
        return sents[:max_sentences]
    top = max(freq.values())
    scored = []
    for i, s in enumerate(sents):
        toks = tokens(s)
        if not toks:
            continue
        score = sum(freq[t] / top for t in toks) / (len(toks) ** 0.5)
        score *= 1.15 if i < 2 else 1.0
        scored.append((score, i, s))
    best = sorted(scored, reverse=True)[:max_sentences]
    return [s for _, _, s in sorted(best, key=lambda x: x[1])]


def _keyterms(text: str) -> tuple[Counter[str], dict[str, str]]:
    freq: Counter[str] = Counter()
    surface: dict[str, str] = {}
    for w in _WORD.findall(text):
        n = normalize(w)
        if len(n) < 4 or n in STOPWORDS or n.isdigit():
            continue
        st = stem(n)
        freq[st] += 1
        surface.setdefault(st, w)
    return freq, surface


def _seeded_order(items: list[str], seed: str) -> list[str]:
    return sorted(items, key=lambda x: hashlib.sha256(f"{seed}:{x}".encode()).hexdigest())


def generate_questions(text: str, count: int = 5) -> list[dict]:
    sents = [s for s in sentences(text) if 40 <= len(s) <= 400]
    freq, surface = _keyterms(text)
    if len(freq) < 4 or not sents:
        return []
    ranked_terms = [t for t, _ in freq.most_common(60)]
    questions: list[dict] = []
    used_terms: set[str] = set()
    for s in sorted(sents, key=lambda x: -sum(freq[stem(normalize(w))] for w in _WORD.findall(x)))[: count * 3]:
        words = [w for w in _WORD.findall(s) if len(normalize(w)) >= 4 and normalize(w) not in STOPWORDS and not normalize(w).isdigit()]
        if not words:
            continue
        target = max(words, key=lambda w: freq[stem(normalize(w))])
        st = stem(normalize(target))
        if st in used_terms or freq[st] < 1:
            continue
        distractors = [surface[t] for t in ranked_terms if t != st and surface[t] not in s][:3]
        if len(distractors) < 3:
            continue
        used_terms.add(st)
        prompt = re.sub(rf"(?<!\w){re.escape(target)}(?!\w)", "_____", s, count=1)
        options = _seeded_order([target, *distractors], s)
        questions.append({"prompt": prompt, "options": options, "answer": options.index(target), "explanation": s})
        if len(questions) >= count:
            break
    return questions
