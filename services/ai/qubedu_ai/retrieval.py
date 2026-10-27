"""BM25 ranking over course chunks and extractive answer selection."""

from __future__ import annotations

import math
from collections import Counter
from dataclasses import dataclass

from .text import expand_with_synonyms, sentences, tokens


@dataclass
class Chunk:
    id: str
    title: str
    text: str
    heading: str | None = None
    page: int | None = None
    material_id: str | None = None


@dataclass
class Hit:
    chunk: Chunk
    score: float


class BM25:
    def __init__(self, docs: list[list[str]], k1: float = 1.5, b: float = 0.75) -> None:
        self.docs = docs
        self.k1 = k1
        self.b = b
        self.n = len(docs)
        self.avgdl = (sum(len(d) for d in docs) / self.n) if self.n else 0.0
        df: Counter[str] = Counter()
        for d in docs:
            df.update(set(d))
        self.idf = {t: math.log(1 + (self.n - f + 0.5) / (f + 0.5)) for t, f in df.items()}
        self.tf = [Counter(d) for d in docs]

    def score(self, query: list[str], i: int) -> float:
        tf = self.tf[i]
        dl = len(self.docs[i]) or 1
        s = 0.0
        for q in set(query):
            f = tf.get(q, 0)
            if not f:
                continue
            idf = self.idf.get(q, 0.0)
            s += idf * (f * (self.k1 + 1)) / (f + self.k1 * (1 - self.b + self.b * dl / (self.avgdl or 1)))
        return s


def rank(question: str, chunks: list[Chunk], synonyms: dict[str, list[str]] | None = None, top: int = 5) -> list[Hit]:
    if not chunks:
        return []
    q = expand_with_synonyms(tokens(question), synonyms or {})
    if not q:
        return []
    docs = [tokens(f"{c.heading or ''} {c.title} {c.text}") for c in chunks]
    bm = BM25(docs)
    scored = [Hit(c, bm.score(q, i)) for i, c in enumerate(chunks)]
    scored = [h for h in scored if h.score > 0]
    scored.sort(key=lambda h: h.score, reverse=True)
    return scored[:top]


def best_sentences(question: str, hits: list[Hit], synonyms: dict[str, list[str]] | None = None, limit: int = 3) -> list[tuple[str, Hit]]:
    """Picks the sentences that cover the most query terms (an extractive answer)."""
    q = set(expand_with_synonyms(tokens(question), synonyms or {}))
    if not q:
        return []
    candidates: list[tuple[float, str, Hit]] = []
    for rank_i, h in enumerate(hits):
        for s in sentences(h.chunk.text) or [h.chunk.text]:
            st = set(tokens(s))
            if not st:
                continue
            overlap = len(q & st)
            if not overlap:
                continue
            coverage = overlap / len(q)
            density = overlap / math.sqrt(len(st))
            candidates.append((coverage * 2 + density - rank_i * 0.05, s.strip(), h))
    candidates.sort(key=lambda x: x[0], reverse=True)
    seen: set[str] = set()
    out: list[tuple[str, Hit]] = []
    for _, s, h in candidates:
        if s in seen:
            continue
        seen.add(s)
        out.append((s, h))
        if len(out) >= limit:
            break
    return out


def coverage(question: str, text: str, synonyms: dict[str, list[str]] | None = None) -> float:
    q = set(expand_with_synonyms(tokens(question), synonyms or {}))
    if not q:
        return 0.0
    return len(q & set(tokens(text))) / len(q)
