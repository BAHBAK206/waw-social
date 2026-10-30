import asyncio

from qubedu_ai import engine
from qubedu_ai.rubric import rubric_feedback


def run(coro):
    return asyncio.run(coro)


def test_socratic_math_gives_hints_not_the_answer():
    r = run(engine.solve({"question": "حل المعادلة 2x + 3 = 11", "mode": "socratic", "language": "ar"}, None))
    assert r["kind"] == "socratic"
    assert "x = 4" not in r["answer"]
    assert "تلميح 1" in r["answer"]
    assert r["choice"] is None


def test_socratic_points_to_the_material_and_asks():
    chunks = [{"id": "1", "title": "Biology", "heading": "Photosynthesis", "page": 12, "text": "Plants make glucose from sunlight, water and carbon dioxide."}]
    r = run(engine.solve({"question": "What do plants make in photosynthesis?", "mode": "socratic", "language": "en", "chunks": chunks}, None))
    assert "glucose" not in r["answer"].lower()
    assert "Photosynthesis" in r["answer"]
    assert r["answer"].strip().endswith("track.")


def test_assistant_hints_mode():
    r = run(engine.assistant({"message": "solve x^2 - 5x + 6 = 0", "language": "en", "socratic": True}, None))
    assert "x = 2, x = 3" not in r["content"]
    assert "Hint 1" in r["content"]


CRITERIA = [
    {
        "title": "Causes of the water cycle",
        "description": "Explains evaporation, condensation and precipitation",
        "levels": [{"label": "Weak", "points": 1}, {"label": "Good", "points": 3}, {"label": "Excellent", "points": 5}],
    },
    {
        "title": "Examples",
        "description": "Gives real examples such as rain and clouds",
        "levels": [{"label": "None", "points": 0}, {"label": "Some", "points": 2}],
    },
]


def test_rubric_feedback_rates_each_criterion():
    good = (
        "The water cycle starts with evaporation, when the sun heats seas and rivers. "
        "Then condensation forms clouds high in the sky. Finally precipitation brings rain and snow back to the ground. "
    ) * 4
    r = run(rubric_feedback(good, CRITERIA, "en"))
    assert r["stats"]["words"] > 100
    first = r["criteria"][0]
    assert first["level"] == 2
    assert "evaporation" in [w.lower() for w in first["found"]]
    weak = run(rubric_feedback("Water goes up and down.", CRITERIA, "en"))
    assert weak["criteria"][0]["level"] == 0
    assert weak["criteria"][0]["missing"]
    assert "short" in weak["overall"]
