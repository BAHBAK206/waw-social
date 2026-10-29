"""Qubedu AI service (internal). Called only by the API with an internal token."""

from __future__ import annotations

import hmac
import logging
import os
from typing import Annotated, Literal
from urllib.parse import unquote

from fastapi import Depends, FastAPI, Header, HTTPException, Request
from pydantic import BaseModel, Field

from . import engine, ocr, teacher, transcribe
from .essay import grade_essay
from .extract import ExtractError, extract
from .llm import build_provider
from .rubric import rubric_feedback

logging.basicConfig(level=os.getenv("LOG_LEVEL", "INFO").upper())

INTERNAL_TOKEN = os.getenv("INTERNAL_TOKEN", "dev-internal-token-change-me")
MAX_UPLOAD = 25 * 1024 * 1024

app = FastAPI(title="Qubedu AI", version="2.0.0", docs_url=None, redoc_url=None, openapi_url=None)
provider = build_provider()


def require_internal(x_internal_token: Annotated[str | None, Header()] = None) -> None:
    if not x_internal_token or not hmac.compare_digest(x_internal_token, INTERNAL_TOKEN):
        raise HTTPException(status_code=401, detail="unauthorized")


Internal = Depends(require_internal)


class ChunkIn(BaseModel):
    id: str = ""
    title: str = ""
    heading: str | None = None
    page: int | None = None
    text: str = Field(default="", max_length=8000)
    materialId: str | None = None


class SolveIn(BaseModel):
    question: str = Field(min_length=1, max_length=4000)
    material: str | None = Field(default=None, max_length=60000)
    options: list[str] | None = Field(default=None, max_length=8)
    chunks: list[ChunkIn] = Field(default_factory=list, max_length=60)
    synonyms: dict[str, list[str]] = Field(default_factory=dict)
    mode: Literal["solve", "explain", "summarize", "quiz", "socratic"] = "solve"
    language: str = "ar"


class EssayIn(BaseModel):
    answer: str = Field(min_length=1, max_length=10000)
    modelAnswer: str = Field(default="", max_length=10000)
    keyPoints: list[str] = Field(min_length=1, max_length=30)
    synonyms: dict[str, list[str]] = Field(default_factory=dict)
    language: str = "ar"


class HistoryItem(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(max_length=8000)


class KnowledgeIn(BaseModel):
    question: str
    answer: str
    link: str | None = None


class GuideIn(BaseModel):
    id: str = Field(max_length=60)
    title: str = Field(max_length=200)
    summary: str = Field(max_length=2000)
    steps: list[str] = Field(default_factory=list, max_length=20)
    tips: list[str] = Field(default_factory=list, max_length=10)
    note: str | None = Field(default=None, max_length=1000)
    link: str | None = Field(default=None, max_length=300)
    guide: str | None = Field(default=None, max_length=300)


class AssistantIn(BaseModel):
    message: str = Field(min_length=1, max_length=4000)
    history: list[HistoryItem] = Field(default_factory=list, max_length=20)
    knowledge: list[KnowledgeIn] = Field(default_factory=list, max_length=20)
    chunks: list[ChunkIn] = Field(default_factory=list, max_length=30)
    guides: list[GuideIn] = Field(default_factory=list, max_length=60)
    language: str = "ar"
    userName: str = ""
    socratic: bool = False


@app.get("/health")
async def health() -> dict:
    return {"ok": True, "provider": "anthropic" if provider else "qubedu"}


@app.post("/v1/solve", dependencies=[Internal])
async def solve(body: SolveIn) -> dict:
    return await engine.solve(body.model_dump(), provider)


@app.post("/v1/grade-essay", dependencies=[Internal])
async def essay(body: EssayIn) -> dict:
    return grade_essay(body.answer, body.modelAnswer, body.keyPoints, body.synonyms, body.language)


class LevelIn(BaseModel):
    label: str = Field(max_length=80)
    points: float = 0


class CriterionIn(BaseModel):
    title: str = Field(max_length=160)
    description: str = Field(default="", max_length=1000)
    levels: list[LevelIn] = Field(default_factory=list, max_length=8)


class RubricIn(BaseModel):
    text: str = Field(min_length=1, max_length=20000)
    criteria: list[CriterionIn] = Field(min_length=1, max_length=20)
    language: str = "ar"


@app.post("/v1/rubric", dependencies=[Internal])
async def rubric(body: RubricIn) -> dict:
    return await rubric_feedback(body.text, [c.model_dump() for c in body.criteria], body.language[:2], provider)


@app.post("/v1/assistant", dependencies=[Internal])
async def assistant(body: AssistantIn) -> dict:
    payload = body.model_dump()
    return await engine.assistant(payload, provider)


class CueIn(BaseModel):
    start: float = Field(ge=0)
    end: float = Field(ge=0)
    text: str = Field(max_length=1000)


class TeacherIn(BaseModel):
    task: Literal["quiz", "summary", "chapters", "ideas", "translate"]
    text: str = Field(default="", max_length=120000)
    cues: list[CueIn] = Field(default_factory=list, max_length=5000)
    count: int = Field(default=5, ge=1, le=20)
    types: list[Literal["mc", "tf", "short"]] = Field(default_factory=lambda: ["mc", "tf", "short"])
    language: str = "en"
    targetLanguage: str | None = None


@app.post("/v1/teacher", dependencies=[Internal])
async def teacher_task(body: TeacherIn) -> dict:
    result = await teacher.run(body.model_dump(), provider)
    if "error" in result:
        raise HTTPException(status_code=422, detail=result["error"])
    return result


@app.post("/v1/transcribe", dependencies=[Internal])
async def transcribe_audio(request: Request, x_language: Annotated[str | None, Header()] = None) -> dict:
    """Speech to timed captions with faster-whisper, when installed (pip install faster-whisper)."""
    data = await request.body()
    if len(data) > 200 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="file_too_large")
    try:
        return {"cues": await transcribe.run(data, x_language)}
    except transcribe.Unavailable as e:
        raise HTTPException(status_code=501, detail="transcription_unavailable") from e


@app.post("/v1/ocr", dependencies=[Internal])
async def ocr_image(request: Request, x_language: Annotated[str | None, Header()] = None) -> dict:
    """Text from a photo of a paper, when tesseract is installed."""
    data = await request.body()
    if len(data) > 15 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="file_too_large")
    try:
        return {"text": await ocr.run(data, x_language)}
    except ocr.Unavailable as e:
        raise HTTPException(status_code=501, detail="ocr_unavailable") from e


@app.post("/v1/extract", dependencies=[Internal])
async def extract_file(request: Request, x_filename: Annotated[str, Header()] = "file", x_mime: Annotated[str, Header()] = "application/octet-stream") -> dict:
    size = int(request.headers.get("content-length") or 0)
    if size > MAX_UPLOAD:
        raise HTTPException(status_code=413, detail="file_too_large")
    data = await request.body()
    if len(data) > MAX_UPLOAD:
        raise HTTPException(status_code=413, detail="file_too_large")
    try:
        return extract(unquote(x_filename), x_mime, data)
    except ExtractError as e:
        raise HTTPException(status_code=422, detail=str(e)) from e
    except Exception as e:  # corrupted files from any parser
        logging.getLogger("qubedu_ai").warning("extract failed: %s", e)
        raise HTTPException(status_code=422, detail="unreadable_file") from e
