"""Multilingual (Arabic-first) text normalization, tokenization and light stemming."""

from __future__ import annotations

import re
import unicodedata

_DIACRITICS = re.compile(r"[ً-ٰٟـ]")
_ARABIC_DIGITS = str.maketrans("٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹", "01234567890123456789")
# \w already covers Arabic letters and digits but not Arabic punctuation (، ؛ ؟), which must split words.
_TOKEN = re.compile(r"\w+", re.UNICODE)
_SENTENCE = re.compile(r"(?<=[.!?؟。\n])\s+|(?<=[.!?؟])(?=[^\s\d])")

STOPWORDS: set[str] = {
    # Arabic
    "في",
    "من",
    "على",
    "الى",
    "إلى",
    "عن",
    "ان",
    "أن",
    "إن",
    "او",
    "أو",
    "ما",
    "ماذا",
    "هل",
    "هو",
    "هي",
    "هم",
    "هذا",
    "هذه",
    "ذلك",
    "تلك",
    "التي",
    "الذي",
    "الذين",
    "كان",
    "كانت",
    "يكون",
    "مع",
    "بين",
    "كل",
    "قد",
    "لا",
    "لم",
    "لن",
    "ثم",
    "حتى",
    "عند",
    "اذا",
    "إذا",
    "كيف",
    "لماذا",
    "متى",
    "اين",
    "أين",
    "اي",
    "أي",
    "و",
    "ف",
    "ب",
    "ل",
    "يا",
    "انا",
    "أنا",
    "نحن",
    "انت",
    "أنت",
    "به",
    "بها",
    "له",
    "لها",
    "منه",
    "منها",
    "عليه",
    "عليها",
    "هناك",
    "ايضا",
    "أيضا",
    "فقط",
    "بعض",
    "غير",
    "ليس",
    "مثل",
    "اكثر",
    "أكثر",
    "اقل",
    "أقل",
    "تم",
    "يتم",
    "اشرح",
    # English
    "the",
    "a",
    "an",
    "and",
    "or",
    "of",
    "to",
    "in",
    "on",
    "for",
    "is",
    "are",
    "was",
    "were",
    "be",
    "been",
    "it",
    "this",
    "that",
    "these",
    "those",
    "with",
    "as",
    "by",
    "at",
    "from",
    "what",
    "which",
    "who",
    "whom",
    "why",
    "how",
    "when",
    "where",
    "do",
    "does",
    "did",
    "can",
    "could",
    "should",
    "would",
    "will",
    "not",
    "no",
    "yes",
    "i",
    "you",
    "he",
    "she",
    "we",
    "they",
    "me",
    "my",
    "your",
    "its",
    "our",
    "their",
    "about",
    "into",
    "than",
    "explain",
    "please",
    "tell",
    # French
    "le",
    "la",
    "les",
    "un",
    "une",
    "des",
    "et",
    "ou",
    "de",
    "du",
    "au",
    "aux",
    "en",
    "est",
    "sont",
    "que",
    "qui",
    "quoi",
    "pour",
    "par",
    "dans",
    "sur",
    "avec",
    "ce",
    "cette",
    "ces",
    "il",
    "elle",
    "nous",
    "vous",
    "ils",
    "pas",
    # Spanish
    "el",
    "los",
    "las",
    "y",
    "o",
    "del",
    "al",
    "es",
    "son",
    "quien",
    "para",
    "por",
    "con",
    "este",
    "esta",
    "estos",
    "como",
    "cuando",
    "donde",
    "porque",
    "se",
    "su",
    "sus",
}

_AR_PREFIXES = ("وال", "بال", "كال", "فال", "لل", "ال", "و", "ف", "ب", "ل", "ك")
_AR_SUFFIXES = ("هما", "كما", "تان", "تين", "ات", "ون", "ين", "ها", "هم", "هن", "كم", "نا", "يه", "ه", "ي")
_EN_SUFFIXES = ("ations", "ation", "ments", "ment", "ingly", "ing", "edly", "ed", "ly")


def normalize(text: str) -> str:
    """Same rules as the TypeScript `normalizeSearch` so API pre-filtering and AI ranking agree."""
    t = unicodedata.normalize("NFKD", text)
    t = "".join(ch for ch in t if not unicodedata.combining(ch))
    t = _DIACRITICS.sub("", t)
    t = t.translate(_ARABIC_DIGITS)
    t = re.sub(r"[أإآٱ]", "ا", t)
    t = t.replace("ى", "ي").replace("ة", "ه").replace("ؤ", "و").replace("ئ", "ي")
    return re.sub(r"\s+", " ", t.lower()).strip()


def is_arabic(text: str) -> bool:
    letters = [ch for ch in text if ch.isalpha()]
    if not letters:
        return False
    return sum(1 for ch in letters if "؀" <= ch <= "ۿ") / len(letters) > 0.3


def stem(token: str) -> str:
    if re.fullmatch(r"[؀-ۿ]+", token):
        t = token
        for p in _AR_PREFIXES:
            if t.startswith(p) and len(t) - len(p) >= 3:
                t = t[len(p) :]
                break
        for s in _AR_SUFFIXES:
            if t.endswith(s) and len(t) - len(s) >= 3:
                t = t[: -len(s)]
                break
        return t
    if token.isascii() and token.isalpha():
        t = token
        if t.endswith("ies") and len(t) > 4:
            t = t[:-3] + "y"
        elif t.endswith("es") and len(t) > 4 and t[:-2].endswith(("s", "x", "z", "ch", "sh")):
            t = t[:-2]
        elif t.endswith("s") and not t.endswith(("ss", "us", "is")) and len(t) > 3:
            t = t[:-1]
        for s in _EN_SUFFIXES:
            if t.endswith(s) and len(t) - len(s) >= 3:
                t = t[: -len(s)]
                break
        if t.endswith("e") and len(t) > 4:
            t = t[:-1]
        return t
    return token


_STOP_NORMALIZED: set[str] = set()


def tokens(text: str, *, keep_stopwords: bool = False) -> list[str]:
    if not _STOP_NORMALIZED:
        _STOP_NORMALIZED.update(normalize(w) for w in STOPWORDS)
    out = []
    for raw in _TOKEN.findall(normalize(text)):
        if not keep_stopwords and (raw in _STOP_NORMALIZED or len(raw) < 2):
            continue
        out.append(stem(raw))
    return out


def sentences(text: str) -> list[str]:
    parts = [p.strip() for p in _SENTENCE.split(text.replace("\r", "")) if p and p.strip()]
    return [p for p in parts if len(p) >= 12]


def expand_with_synonyms(toks: list[str], synonyms: dict[str, list[str]]) -> list[str]:
    """Adds teacher-defined synonyms (both directions) as extra query terms."""
    if not synonyms:
        return toks
    index: dict[str, set[str]] = {}
    for term, syns in synonyms.items():
        group = {stem(normalize(term))} | {stem(normalize(s)) for s in syns}
        for g in group:
            index.setdefault(g, set()).update(group)
    out = list(toks)
    for t in toks:
        out.extend(sorted(index.get(t, set()) - {t}))
    return out
