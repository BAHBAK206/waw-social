from fastapi.testclient import TestClient

from qubedu_ai.main import app
from qubedu_ai.teacher import deterministic_chapters, deterministic_quiz

client = TestClient(app)
H = {"x-internal-token": "dev-internal-token-change-me"}

LESSON = (
    "Photosynthesis is the process plants use to make glucose from light. "
    "Chlorophyll inside the chloroplast absorbs sunlight and gives leaves their green colour. "
    "During photosynthesis, carbon dioxide from the air and water from the roots are combined. "
    "Oxygen is released into the atmosphere as a by-product of photosynthesis. "
    "The glucose produced is stored as starch or used for respiration in the mitochondria. "
    "Stomata are tiny openings on the leaf that let carbon dioxide enter and oxygen leave. "
    "Without chlorophyll, plants could not capture the energy of sunlight for photosynthesis."
)


def test_quiz_mixes_types_and_every_question_is_answerable():
    qs = deterministic_quiz(LESSON, 4, ["mc", "tf", "short"])
    assert len(qs) >= 3
    assert {q["type"] for q in qs} >= {"mc", "tf"}
    for q in qs:
        if q["type"] == "mc":
            assert "_____" in q["prompt"] and 0 <= q["answer"] < len(q["options"])
        if q["type"] == "tf":
            assert q["answer"] in (0, 1) and q["options"] == ["true", "false"]
        if q["type"] == "short":
            assert q["answer"] and q["answer"][0]


def test_chapters_start_at_zero_and_follow_time():
    cues = [{"start": i * 20, "end": i * 20 + 19, "text": t} for i, t in enumerate(LESSON.split(". ") * 3)]
    ch = deterministic_chapters(cues, "en")
    assert ch[0]["at"] == 0 and len(ch) >= 2
    assert [c["at"] for c in ch] == sorted(c["at"] for c in ch)
    assert all(c["title"] for c in ch)


def test_teacher_endpoint_tasks():
    r = client.post("/v1/teacher", json={"task": "quiz", "text": LESSON, "count": 3, "language": "en"}, headers=H)
    assert r.status_code == 200 and r.json()["provider"] == "qubedu" and len(r.json()["questions"]) >= 2
    s = client.post("/v1/teacher", json={"task": "summary", "text": LESSON, "language": "en"}, headers=H).json()
    assert s["summary"] and "photosynthesis" in " ".join(s["keyPoints"]).lower()
    i = client.post("/v1/teacher", json={"task": "ideas", "text": LESSON, "language": "ar", "count": 3}, headers=H).json()
    assert len(i["ideas"]) == 3 and "«" in i["ideas"][0]
    # Translation needs Claude; without it the API is told plainly.
    t = client.post("/v1/teacher", json={"task": "translate", "cues": [{"start": 0, "end": 1, "text": "hi"}], "targetLanguage": "ar"}, headers=H)
    assert t.status_code == 422 and t.json()["detail"] == "needs_ai"


def test_transcribe_reports_when_unavailable(monkeypatch):
    monkeypatch.setenv("TRANSCRIBE_DISABLED", "1")
    r = client.post("/v1/transcribe", content=b"RIFF....", headers=H)
    assert r.status_code == 501
