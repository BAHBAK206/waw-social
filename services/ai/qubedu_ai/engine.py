"""Orchestrates the solver and the assistant on top of the local engine (and optional Claude)."""

from __future__ import annotations

import re

from .generate import generate_questions, summarize
from .i18n import t
from .llm import ClaudeProvider
from .mathsolver import option_matches, solve_math
from .retrieval import Chunk, best_sentences, coverage, rank
from .text import is_arabic, normalize, sentences

_NAV = [
    (("اختبار", "اختبارات", "كويز", "quiz", "test", "examen"), "/quiz", {"ar": "الاختبارات", "en": "Quizzes", "fr": "Quiz", "es": "Cuestionarios"}),
    (
        ("بطاقات", "بطاقة", "flashcard", "cards", "cartes", "tarjetas"),
        "/academic?tab=cards",
        {"ar": "بطاقات المراجعة", "en": "Flashcards", "fr": "Cartes", "es": "Tarjetas"},
    ),
    (
        ("خطة", "جدول المذاكرة", "plan", "planner", "planning"),
        "/academic?tab=plan",
        {"ar": "الخطة الأسبوعية", "en": "Weekly plan", "fr": "Plan hebdo", "es": "Plan semanal"},
    ),
    (("امتحان", "امتحانات", "exam", "exams"), "/academic?tab=exams", {"ar": "جدول الامتحانات", "en": "Exam schedule", "fr": "Examens", "es": "Exámenes"}),
    (("مجموعة", "مجموعات", "جروب", "group", "groupe", "grupo"), "/groups", {"ar": "المجموعات", "en": "Groups", "fr": "Groupes", "es": "Grupos"}),
    (("رسالة", "رسائل", "دردشة", "chat", "message", "mensaje"), "/chat", {"ar": "الرسائل", "en": "Messages", "fr": "Messages", "es": "Mensajes"}),
    (
        ("مكتبة", "كتاب", "ملخص", "library", "book", "bibliothèque", "biblioteca"),
        "/library",
        {"ar": "المكتبة", "en": "Library", "fr": "Bibliothèque", "es": "Biblioteca"},
    ),
    (
        ("كلمة المرور", "كلمة السر", "password", "mot de passe", "contraseña"),
        "/settings?tab=security",
        {"ar": "الأمان", "en": "Security", "fr": "Sécurité", "es": "Seguridad"},
    ),
    (
        ("الإعدادات", "اعدادات", "الثيم", "الألوان", "settings", "theme", "paramètres", "ajustes"),
        "/settings",
        {"ar": "الإعدادات", "en": "Settings", "fr": "Paramètres", "es": "Ajustes"},
    ),
    (
        ("فصل", "مقرر", "واجب", "course", "assignment", "classroom", "cours", "curso"),
        "/school",
        {"ar": "الفصل الدراسي", "en": "Classroom", "fr": "Classe", "es": "Aula"},
    ),
    (
        ("مباشر", "بث", "حصة", "live", "class", "en direct", "en vivo"),
        "/classes",
        {"ar": "الحصص المباشرة", "en": "Live classes", "fr": "Cours en direct", "es": "Clases en vivo"},
    ),
    (("نموذج", "استبيان", "form", "survey", "formulaire", "formulario"), "/forms", {"ar": "النماذج", "en": "Forms", "fr": "Formulaires", "es": "Formularios"}),
    (
        ("مستند", "مساحة العمل", "workspace", "document", "documento"),
        "/workspace",
        {"ar": "مساحة العمل", "en": "Workspace", "fr": "Espace de travail", "es": "Espacio de trabajo"},
    ),
    (
        ("ملاحظة", "ملاحظات", "مهمة", "مهام", "note", "task", "tâche", "tarea"),
        "/organizer",
        {"ar": "المنظم", "en": "Organizer", "fr": "Organiseur", "es": "Organizador"},
    ),
    (
        ("مؤقت", "بومودورو", "تركيز", "pomodoro", "focus", "timer"),
        "/academic?tab=focus",
        {"ar": "مؤقت التركيز", "en": "Focus timer", "fr": "Minuteur", "es": "Temporizador"},
    ),
]

_GREETING = re.compile(r"^\s*(hi|hello|hey|salut|bonjour|hola|مرحبا|اهلا|أهلا|السلام عليكم|سلام|هاي)[\s!.؟?]*$", re.IGNORECASE)


def _lang(language: str, text: str) -> str:
    lang = (language or "").lower()[:2]
    if lang in ("ar", "en", "fr", "es"):
        return lang
    return "ar" if is_arabic(text) else "en"


def _chunks(raw: list[dict], material: str | None) -> list[Chunk]:
    out = [
        Chunk(
            id=str(c.get("id", i)),
            title=str(c.get("title", "")),
            text=str(c.get("text", "")),
            heading=c.get("heading"),
            page=c.get("page"),
            material_id=c.get("materialId"),
        )
        for i, c in enumerate(raw)
        if c.get("text")
    ]
    if material:
        paras = [p.strip() for p in re.split(r"\n{2,}", material) if p.strip()] or [material]
        out.extend(Chunk(id=f"m{i}", title="", text=p) for i, p in enumerate(paras))
    return out


def _sources(hits) -> list[dict]:
    seen = set()
    out = []
    for h in hits:
        key = (h.chunk.title, h.chunk.heading, h.chunk.page)
        if key in seen or not h.chunk.title:
            continue
        seen.add(key)
        out.append({"title": h.chunk.title, "heading": h.chunk.heading, "page": h.chunk.page, "snippet": h.chunk.text[:220], "materialId": h.chunk.material_id})
    return out[:4]


def _context(hits, knowledge: list[dict] | None = None) -> str:
    parts = []
    for k in (knowledge or [])[:3]:
        parts.append(f"[FAQ] {k.get('question', '')}\n{k.get('answer', '')}")
    for h in hits[:5]:
        label = " · ".join(x for x in [h.chunk.title, h.chunk.heading or "", f"p.{h.chunk.page}" if h.chunk.page else ""] if x)
        parts.append(f"[{label}]\n{h.chunk.text[:1500]}")
    return "\n\n".join(parts)


async def solve(payload: dict, provider: ClaudeProvider | None) -> dict:
    question: str = payload["question"]
    lang = _lang(payload.get("language", ""), question)
    options: list[str] = payload.get("options") or []
    synonyms: dict = payload.get("synonyms") or {}
    mode: str = payload.get("mode", "solve")
    chunks = _chunks(payload.get("chunks") or [], payload.get("material"))
    base = {"steps": [], "sources": [], "choice": None, "provider": "qubedu"}

    if mode == "summarize":
        text = payload.get("material") or "\n\n".join(c.text for c in chunks[:20])
        summary = summarize(text, 6)
        if not summary:
            return {**base, "answer": t(lang, "uncertain"), "confidence": "uncertain", "kind": "unknown"}
        return {**base, "answer": "\n".join(f"• {s}" for s in summary), "confidence": "medium", "kind": "summary"}

    if mode == "quiz":
        text = payload.get("material") or "\n\n".join(c.text for c in chunks[:30])
        qs = generate_questions(text, 8)
        if not qs:
            return {**base, "answer": t(lang, "uncertain"), "confidence": "uncertain", "kind": "unknown", "generatedQuestions": []}
        return {**base, "answer": "", "confidence": "medium", "kind": "quiz", "generatedQuestions": qs}

    math = solve_math(question)
    if math is not None:
        choice = None
        if options:
            for i, opt in enumerate(options):
                if option_matches(opt, math.value):
                    choice = i
                    break
        answer = math.answer if choice is None else f"{t(lang, 'mcq_pick')} ({choice + 1}) {options[choice]} — {math.answer}"
        return {**base, "answer": answer, "steps": math.steps, "confidence": "high", "kind": "mcq" if choice is not None else "math", "choice": choice}

    hits = rank(question, chunks, synonyms, top=6)
    if options and hits:
        # An option is supported when it appears in the same sentence as the question's key terms.
        candidate_sentences = [s for h in hits[:4] for s in (sentences(h.chunk.text) or [h.chunk.text])]

        def support(opt: str) -> float:
            best_s = 0.0
            for s in candidate_sentences:
                opt_cov = coverage(opt, s, synonyms)
                if opt_cov == 0:
                    continue
                best_s = max(best_s, opt_cov * (0.3 + coverage(question, s, synonyms)))
            return best_s

        scores = [support(opt) for opt in options]
        best = max(range(len(options)), key=lambda i: scores[i])
        ordered = sorted(scores, reverse=True)
        margin = ordered[0] - (ordered[1] if len(ordered) > 1 else 0)
        if ordered[0] > 0.2 and margin > 0.05:
            conf = "high" if margin > 0.35 else "medium" if margin > 0.15 else "low"
            return {
                **base,
                "answer": f"{t(lang, 'mcq_pick')} ({best + 1}) {options[best]}",
                "confidence": conf,
                "kind": "mcq",
                "choice": best,
                "sources": _sources(hits),
            }

    picked = best_sentences(question, hits, synonyms, limit=3)
    if picked:
        cov = coverage(question, picked[0][0], synonyms)
        conf = "high" if cov >= 0.6 else "medium" if cov >= 0.35 else "low"
        if conf != "low" or provider is None:
            answer = "\n".join(s for s, _ in picked)
            return {
                **base,
                "answer": f"{t(lang, 'from_material')}\n{answer}",
                "confidence": conf,
                "kind": "retrieval",
                "sources": _sources([h for _, h in picked]),
            }

    if provider is not None:
        prompt = question if not options else question + "\n" + "\n".join(f"{i + 1}. {o}" for i, o in enumerate(options))
        reply = await provider.reply(prompt, [], _context(hits), lang)
        if reply:
            return {**base, "answer": reply.text, "confidence": "medium", "kind": "llm", "sources": _sources(hits), "provider": reply.provider}

    return {**base, "answer": t(lang, "uncertain"), "confidence": "uncertain", "kind": "unknown", "sources": _sources(hits)}


def _nav_actions(message: str, lang: str) -> list[dict]:
    n = normalize(message)
    actions = []
    for words, link, labels in _NAV:
        if any(normalize(w) in n for w in words):
            actions.append({"label": labels.get(lang, labels["en"]), "link": link})
    return actions[:3]


async def assistant(payload: dict, provider: ClaudeProvider | None) -> dict:
    message: str = payload["message"]
    lang = _lang(payload.get("language", ""), message)
    knowledge: list[dict] = payload.get("knowledge") or []
    chunks = _chunks(payload.get("chunks") or [], None)
    actions = _nav_actions(message, lang)

    if _GREETING.match(message):
        return {"content": t(lang, "greeting", name=payload.get("userName", "")), "sources": [], "actions": actions, "provider": "qubedu"}

    if knowledge:
        kb_chunks = [
            Chunk(id=str(i), title=str(k.get("question", "")), text=f"{k.get('question', '')}\n{k.get('answer', '')}") for i, k in enumerate(knowledge)
        ]
        kb_hits = rank(message, kb_chunks, top=1)
        if kb_hits and coverage(message, kb_hits[0].chunk.title) >= 0.5:
            k = knowledge[int(kb_hits[0].chunk.id)]
            link_actions = [{"label": t(lang, "open"), "link": k["link"]}] if k.get("link") else []
            return {"content": str(k.get("answer", "")), "sources": [], "actions": link_actions + actions, "provider": "qubedu:kb"}

    math = solve_math(message)
    if math is not None:
        steps = "\n".join(f"{i + 1}. {s}" for i, s in enumerate(math.steps))
        return {"content": f"{math.answer}\n\n{t(lang, 'math_steps')}:\n{steps}", "sources": [], "actions": actions, "provider": "qubedu:math"}

    hits = rank(message, chunks, top=6)
    if provider is not None:
        reply = await provider.reply(message, payload.get("history") or [], _context(hits, knowledge), lang)
        if reply:
            return {"content": reply.text, "sources": _sources(hits), "actions": actions, "provider": reply.provider}

    picked = best_sentences(message, hits, limit=3)
    if picked and coverage(message, picked[0][0]) >= 0.35:
        answer = "\n".join(s for s, _ in picked)
        return {
            "content": f"{t(lang, 'from_material')}\n{answer}",
            "sources": _sources([h for _, h in picked]),
            "actions": actions,
            "provider": "qubedu:retrieval",
        }

    return {"content": t(lang, "assistant_fallback"), "sources": [], "actions": actions, "provider": "qubedu"}
