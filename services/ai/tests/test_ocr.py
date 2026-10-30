import os

from fastapi.testclient import TestClient

from qubedu_ai.main import app

client = TestClient(app)
H = {"x-internal-token": "dev-internal-token-change-me"}


def test_ocr_needs_the_internal_token():
    assert client.post("/v1/ocr", content=b"x").status_code == 401


def test_ocr_is_reported_unavailable_when_switched_off():
    os.environ["OCR_DISABLED"] = "1"
    try:
        r = client.post("/v1/ocr", content=b"not an image", headers={**H, "content-type": "image/jpeg"})
    finally:
        del os.environ["OCR_DISABLED"]
    assert r.status_code == 501
    assert r.json()["detail"] == "ocr_unavailable"
