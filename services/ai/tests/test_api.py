from fastapi.testclient import TestClient

from qubedu_ai.main import app

client = TestClient(app)
H = {"x-internal-token": "dev-internal-token-change-me"}


def test_health_is_public():
    assert client.get("/health").json()["ok"] is True


def test_internal_token_required():
    assert client.post("/v1/solve", json={"question": "1+1"}).status_code == 401
    assert client.post("/v1/solve", json={"question": "1+1"}, headers={"x-internal-token": "wrong"}).status_code == 401


def test_solve_endpoint():
    r = client.post("/v1/solve", json={"question": "7 * 6"}, headers=H)
    assert r.status_code == 200
    body = r.json()
    assert body["answer"] == "42" and body["kind"] == "math" and body["provider"] == "qubedu"


def test_validation():
    r = client.post("/v1/solve", json={"question": ""}, headers=H)
    assert r.status_code == 422


def test_extract_endpoint_rejects_unknown_types():
    r = client.post("/v1/extract", content=b"\x00\x01", headers={**H, "x-filename": "x.bin", "x-mime": "application/octet-stream"})
    assert r.status_code == 422
    ok = client.post("/v1/extract", content="سطر أول\n\nسطر ثانٍ طويل بما يكفي".encode(), headers={**H, "x-filename": "n.txt", "x-mime": "text/plain"})
    assert ok.status_code == 200 and ok.json()["chunks"]


def test_essay_endpoint():
    r = client.post("/v1/grade-essay", json={"answer": "Water boils at 100 degrees", "keyPoints": ["boils at 100 degrees"], "language": "en"}, headers=H)
    assert r.json()["score"] >= 80
