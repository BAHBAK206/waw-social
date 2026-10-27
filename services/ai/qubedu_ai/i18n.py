"""User-facing strings for the four supported languages."""

from __future__ import annotations

MESSAGES: dict[str, dict[str, str]] = {
    "ar": {
        "uncertain": "لم أجد إجابة موثوقة لهذا السؤال في المواد المتاحة. جرّب إضافة نص الدرس أو اختيار مقرر، أو اسأل معلمك.",
        "from_material": "من المادة الدراسية:",
        "mcq_pick": "الاختيار الأقرب للصواب هو",
        "essay_good": "إجابة ممتازة، غطّيت معظم النقاط الأساسية.",
        "essay_partial": "إجابة جيدة جزئيًا. راجع النقاط الناقصة وأضفها.",
        "essay_weak": "تحتاج الإجابة إلى تطوير؛ معظم النقاط الأساسية غير موجودة.",
        "summary": "ملخص",
        "assistant_fallback": "لست متأكدًا من الإجابة. يمكنني مساعدتك في التنقل داخل Qubedu أو شرح محتوى مقرراتك. جرّب صياغة السؤال بشكل آخر.",
        "greeting": "أهلًا {name}! كيف أقدر أساعدك في مذاكرتك اليوم؟",
        "open": "افتح",
        "math_steps": "خطوات الحل",
    },
    "en": {
        "uncertain": "I couldn't find a reliable answer in the available material. Try adding the lesson text, choosing a course, or asking your teacher.",
        "from_material": "From your course material:",
        "mcq_pick": "The most likely correct option is",
        "essay_good": "Excellent answer — you covered most key points.",
        "essay_partial": "Partly correct. Review the missing points and add them.",
        "essay_weak": "This answer needs work; most key points are missing.",
        "summary": "Summary",
        "assistant_fallback": "I'm not sure about that. I can help you navigate Qubedu or explain your course content — try rephrasing.",
        "greeting": "Hi {name}! How can I help you study today?",
        "open": "Open",
        "math_steps": "Steps",
    },
    "fr": {
        "uncertain": "Je n'ai pas trouvé de réponse fiable dans les documents disponibles. Ajoutez le texte du cours, choisissez un cours ou demandez à votre enseignant.",
        "from_material": "D'après votre cours :",
        "mcq_pick": "L'option la plus probable est",
        "essay_good": "Excellente réponse : la plupart des points clés sont couverts.",
        "essay_partial": "Réponse partielle. Revoyez les points manquants.",
        "essay_weak": "La réponse doit être développée ; la plupart des points clés manquent.",
        "summary": "Résumé",
        "assistant_fallback": "Je ne suis pas sûr. Je peux vous aider à naviguer dans Qubedu ou expliquer vos cours — reformulez la question.",
        "greeting": "Bonjour {name} ! Comment puis-je vous aider à réviser aujourd'hui ?",
        "open": "Ouvrir",
        "math_steps": "Étapes",
    },
    "es": {
        "uncertain": "No encontré una respuesta fiable en el material disponible. Añade el texto de la lección, elige un curso o pregunta a tu profesor.",
        "from_material": "Según tu material del curso:",
        "mcq_pick": "La opción más probable es",
        "essay_good": "¡Excelente respuesta! Cubriste la mayoría de los puntos clave.",
        "essay_partial": "Respuesta parcial. Revisa los puntos que faltan.",
        "essay_weak": "La respuesta necesita mejorar; faltan la mayoría de los puntos clave.",
        "summary": "Resumen",
        "assistant_fallback": "No estoy seguro. Puedo ayudarte a navegar por Qubedu o explicar tu material — intenta reformular.",
        "greeting": "¡Hola {name}! ¿Cómo te ayudo a estudiar hoy?",
        "open": "Abrir",
        "math_steps": "Pasos",
    },
}


def t(lang: str, key: str, **kw: str) -> str:
    table = MESSAGES.get(lang[:2] if lang else "ar", MESSAGES["en"])
    return table.get(key, MESSAGES["en"][key]).format(**kw)
