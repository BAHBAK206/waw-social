"""Teacher tools: quiz drafts, lesson summaries, chapters, assignment ideas and caption translation.

Everything except translation works without any external service (deterministic, extractive). When Claude is
configured, it writes better questions and summaries; its output is validated and the deterministic result is used
whenever it is missing or malformed.
"""

from __future__ import annotations

import hashlib
import json
import logging
import re

from .generate import _keyterms, generate_questions, summarize
from .text import normalize, stem

log = logging.getLogger("qubedu_ai.teacher")
_WORD = re.compile(r"\w+", re.UNICODE)

IDEA_TEMPLATES: dict[str, list[str]] = {
    "ar": [
        "اشرح مفهوم «{a}» بكلماتك في فقرة قصيرة مع مثال من حياتك اليومية.",
        "قارن بين «{a}» و«{b}» في جدول من ثلاث نقاط.",
        "اصنع خريطة ذهنية تربط «{a}» و«{b}» و«{c}».",
        "اكتب ثلاثة أسئلة يمكن أن تأتي في الامتحان عن «{a}» وأجب عنها.",
        "ابحث عن تطبيق عملي لـ«{b}» وقدّمه في عرض من ثلاث شرائح.",
        "علّم زميلًا فكرة «{c}» في دقيقتين وسجّل أهم سؤال سألك إياه.",
    ],
    "en": [
        "Explain “{a}” in your own words in a short paragraph, with an everyday example.",
        "Compare “{a}” and “{b}” in a three-point table.",
        "Draw a mind map connecting “{a}”, “{b}” and “{c}”.",
        "Write three exam-style questions about “{a}” and answer them.",
        "Find a real-world use of “{b}” and present it in three slides.",
        "Teach “{c}” to a classmate in two minutes and note the best question they asked.",
    ],
    "fr": [
        "Expliquez « {a} » avec vos propres mots en un court paragraphe, avec un exemple du quotidien.",
        "Comparez « {a} » et « {b} » dans un tableau en trois points.",
        "Faites une carte mentale reliant « {a} », « {b} » et « {c} ».",
        "Rédigez trois questions d’examen sur « {a} » et répondez-y.",
        "Trouvez une application concrète de « {b} » et présentez-la en trois diapositives.",
        "Expliquez « {c} » à un camarade en deux minutes et notez sa meilleure question.",
    ],
    "es": [
        "Explica «{a}» con tus palabras en un párrafo corto, con un ejemplo de la vida diaria.",
        "Compara «{a}» y «{b}» en una tabla de tres puntos.",
        "Haz un mapa mental que conecte «{a}», «{b}» y «{c}».",
        "Escribe tres preguntas tipo examen sobre «{a}» y respóndelas.",
        "Busca un uso real de «{b}» y preséntalo en tres diapositivas.",
        "Enseña «{c}» a un compañero en dos minutos y anota la mejor pregunta que te hizo.",
    ],
}
PART: dict[str, str] = {"ar": "الجزء", "en": "Part", "fr": "Partie", "es": "Parte"}


def _lang(language: str) -> str:
    return language if language in IDEA_TEMPLATES else "en"


def key_terms(text: str, n: int = 8) -> list[str]:
    freq, surface = _keyterms(text)
    return [surface[t] for t, _ in freq.most_common(n)]


def _seed_pick(items: list[str], seed: str) -> str:
    return sorted(items, key=lambda x: hashlib.sha256(f"{seed}:{x}".encode()).hexdigest())[0]


def deterministic_quiz(text: str, count: int, types: list[str]) -> list[dict]:
    """Cloze multiple choice, true/false (a key term swapped for a distractor) and short answers from the lesson text."""
    base = generate_questions(text, count * 2)
    out: list[dict] = []
    allowed = [t for t in types if t in ("mc", "tf", "short")] or ["mc"]
    for i, q in enumerate(base):
        kind = allowed[i % len(allowed)]
        correct = q["options"][q["answer"]]
        if kind == "mc":
            out.append({"type": "mc", "prompt": q["prompt"], "options": q["options"], "answer": q["answer"], "explanation": q["explanation"]})
        elif kind == "short":
            out.append({"type": "short", "prompt": q["prompt"], "options": [], "answer": [correct], "explanation": q["explanation"]})
        else:
            sentence = q["explanation"]
            wrong = [o for o in q["options"] if o != correct]
            # Half the statements are true, half have a key term swapped (deterministic by sentence).
            truthful = int(hashlib.sha256(sentence.encode()).hexdigest(), 16) % 2 == 0
            statement = sentence if truthful or not wrong else re.sub(rf"(?<!\w){re.escape(correct)}(?!\w)", _seed_pick(wrong, sentence), sentence, count=1)
            out.append({"type": "tf", "prompt": statement, "options": ["true", "false"], "answer": 0 if truthful else 1, "explanation": sentence})
        if len(out) >= count:
            break
    return out


def deterministic_chapters(cues: list[dict], language: str, max_chapters: int = 8) -> list[dict]:
    """Splits the transcript into evenly timed parts titled with each part's most distinctive term."""
    cues = [c for c in cues if str(c.get("text", "")).strip()]
    if not cues:
        return []
    duration = float(cues[-1].get("end") or cues[-1].get("start") or 0)
    n = max(2, min(max_chapters, int(duration // 90) + 1))
    span = max(duration / n, 1.0)
    groups: list[list[dict]] = [[] for _ in range(n)]
    for c in cues:
        groups[min(n - 1, int(float(c.get("start", 0)) // span))].append(c)
    global_freq, _ = _keyterms(" ".join(c["text"] for c in cues))
    chapters: list[dict] = []
    used: set[str] = set()
    for i, g in enumerate(groups):
        if not g:
            continue
        text = " ".join(c["text"] for c in g)
        freq, surface = _keyterms(text)
        # Distinctive = frequent here, rarer overall.
        ranked = sorted(freq, key=lambda t: -(freq[t] / (1 + global_freq[t] - freq[t])))
        title = next((surface[t] for t in ranked if t not in used), None)
        if title:
            used.add(stem(normalize(title)))
            title = title[:1].upper() + title[1:]
        else:
            title = f"{PART[_lang(language)]} {i + 1}"
        chapters.append({"at": int(float(g[0].get("start", 0))), "title": title[:80]})
    if chapters:
        chapters[0]["at"] = 0
    return chapters


def deterministic_ideas(text: str, language: str, count: int = 5) -> list[str]:
    terms = key_terms(text, 6)
    if len(terms) < 3:
        return []
    a, b, c = terms[0], terms[1], terms[2]
    return [t.format(a=a, b=b, c=c) for t in IDEA_TEMPLATES[_lang(language)][:count]]


def _json_from(text: str) -> dict | None:
    m = re.search(r"\{.*\}", text, re.S)
    if not m:
        return None
    try:
        data = json.loads(m.group(0))
    except json.JSONDecodeError:
        return None
    return data if isinstance(data, dict) else None


def _valid_questions(raw: object, count: int) -> list[dict]:
    out: list[dict] = []
    if not isinstance(raw, list):
        return out
    for q in raw:
        if not isinstance(q, dict):
            continue
        t = q.get("type")
        prompt = str(q.get("prompt", "")).strip()
        expl = str(q.get("explanation", "") or "").strip() or None
        if not prompt:
            continue
        if t == "mc":
            opts = [str(o).strip() for o in q.get("options", []) if str(o).strip()]
            ans = q.get("answer")
            if 2 <= len(opts) <= 6 and isinstance(ans, int) and 0 <= ans < len(opts):
                out.append({"type": "mc", "prompt": prompt, "options": opts, "answer": ans, "explanation": expl})
        elif t == "tf" and isinstance(q.get("answer"), bool):
            out.append({"type": "tf", "prompt": prompt, "options": ["true", "false"], "answer": 0 if q["answer"] else 1, "explanation": expl})
        elif t == "short":
            accepted = [str(a).strip() for a in (q.get("answer") or []) if str(a).strip()] if isinstance(q.get("answer"), list) else []
            if accepted:
                out.append({"type": "short", "prompt": prompt, "options": [], "answer": accepted[:5], "explanation": expl})
        if len(out) >= count:
            break
    return out


LANG_NAMES = {"ar": "Arabic", "en": "English", "fr": "French", "es": "Spanish"}


async def run(payload: dict, provider) -> dict:
    task = payload["task"]
    language = _lang(payload.get("language", "en"))
    text = str(payload.get("text", ""))[:60000]
    cues = payload.get("cues") or []
    count = max(1, min(20, int(payload.get("count", 5))))
    types = payload.get("types") or ["mc", "tf", "short"]
    name = LANG_NAMES[language]

    if task == "translate":
        target = _lang(payload.get("targetLanguage", "en"))
        if not provider:
            return {"error": "needs_ai"}
        lines = [{"i": i, "text": str(c.get("text", ""))[:500]} for i, c in enumerate(cues[:1500])]
        out: list[dict] = []
        # Batches keep each request small and let a partial failure fall back per batch.
        for start in range(0, len(lines), 120):
            batch = lines[start : start + 120]
            reply = await provider.task(
                f"Translate each caption line into {LANG_NAMES[target]}. Keep meaning, register and line length similar; "
                'never merge or split lines. Reply only with JSON: {"lines": [{"i": <index>, "text": "<translation>"}]}.',
                json.dumps({"lines": batch}, ensure_ascii=False),
            )
            data = _json_from(reply.text) if reply else None
            got = {int(x["i"]): str(x["text"]) for x in (data or {}).get("lines", []) if isinstance(x, dict) and "i" in x and "text" in x}
            if len(got) < len(batch) * 0.9:
                return {"error": "translation_failed"}
            out.extend({**cues[x["i"]], "text": got.get(x["i"], x["text"])} for x in batch)
        return {"cues": out, "provider": "anthropic"}

    if task == "quiz":
        fallback = deterministic_quiz(text, count, types)
        if provider and text.strip():
            reply = await provider.task(
                f"You write quiz questions for a teacher, in {name}, strictly from the lesson below. Make {count} questions using these types: "
                f"{', '.join(types)}. Test understanding, not trivia; one clearly correct answer; plausible distractors; a one-sentence explanation each. "
                'Reply only with JSON: {"questions": [{"type": "mc", "prompt": "...", "options": ["..."], "answer": <index>, "explanation": "..."}, '
                '{"type": "tf", "prompt": "<statement>", "answer": true, "explanation": "..."}, '
                '{"type": "short", "prompt": "...", "answer": ["<accepted answer>", "..."], "explanation": "..."}]}',
                text,
            )
            data = _json_from(reply.text) if reply else None
            good = _valid_questions((data or {}).get("questions"), count)
            if len(good) >= max(1, count // 2):
                return {"questions": good, "provider": "anthropic"}
        return {"questions": fallback, "provider": "qubedu"}

    if task == "summary":
        fallback = {"summary": summarize(text, 5), "keyPoints": key_terms(text, 8), "provider": "qubedu"}
        if provider and text.strip():
            reply = await provider.task(
                f"Summarize this lesson for students in {name}: 3-6 short sentences, then up to 8 key terms. "
                'Reply only with JSON: {"summary": ["..."], "keyPoints": ["..."]}',
                text,
            )
            data = _json_from(reply.text) if reply else None
            summary = [str(s).strip() for s in (data or {}).get("summary", []) if str(s).strip()][:8]
            keys = [str(s).strip() for s in (data or {}).get("keyPoints", []) if str(s).strip()][:10]
            if summary:
                return {"summary": summary, "keyPoints": keys, "provider": "anthropic"}
        return fallback

    if task == "chapters":
        fallback = deterministic_chapters(cues, language)
        if provider and cues:
            transcript = "\n".join(f"[{int(float(c.get('start', 0)))}] {c.get('text', '')}" for c in cues[:2500])
            reply = await provider.task(
                f"Split this timed lesson transcript into 3-10 chapters with short titles in {name}. The first chapter starts at 0. "
                'Reply only with JSON: {"chapters": [{"at": <seconds>, "title": "..."}]}',
                transcript,
            )
            data = _json_from(reply.text) if reply else None
            chapters = []
            for ch in (data or {}).get("chapters", []):
                if isinstance(ch, dict) and isinstance(ch.get("at"), int | float) and str(ch.get("title", "")).strip():
                    chapters.append({"at": max(0, int(ch["at"])), "title": str(ch["title"]).strip()[:80]})
            chapters.sort(key=lambda c: c["at"])
            if len(chapters) >= 2:
                chapters[0]["at"] = 0
                return {"chapters": chapters, "provider": "anthropic"}
        return {"chapters": fallback, "provider": "qubedu"}

    if task == "ideas":
        fallback = deterministic_ideas(text, language, count)
        if provider and text.strip():
            reply = await provider.task(
                f"Suggest {count} varied assignment or activity ideas in {name} for students who studied this lesson "
                "(explain, apply, compare, create, discuss). One sentence each. "
                'Reply only with JSON: {"ideas": ["..."]}',
                text,
            )
            data = _json_from(reply.text) if reply else None
            ideas = [str(s).strip() for s in (data or {}).get("ideas", []) if str(s).strip()][:count]
            if ideas:
                return {"ideas": ideas, "provider": "anthropic"}
        return {"ideas": fallback, "provider": "qubedu"}

    return {"error": "unknown_task"}
