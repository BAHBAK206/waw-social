"""Optional speech-to-text for lesson captions (faster-whisper). Install it and set WHISPER_MODEL (default "small")."""

from __future__ import annotations

import asyncio
import os
import tempfile


class Unavailable(Exception):
    pass


_model = None


def _load():
    global _model
    if _model is None:
        try:
            from faster_whisper import WhisperModel  # type: ignore[import-not-found]
        except ImportError as e:
            raise Unavailable("faster-whisper is not installed") from e
        _model = WhisperModel(os.getenv("WHISPER_MODEL", "small"), device="cpu", compute_type="int8")
    return _model


def _transcribe(data: bytes, language: str | None) -> list[dict]:
    model = _load()
    with tempfile.NamedTemporaryFile(suffix=".wav") as f:
        f.write(data)
        f.flush()
        segments, _info = model.transcribe(f.name, language=language or None, vad_filter=True)
        return [{"start": round(s.start, 2), "end": round(s.end, 2), "text": s.text.strip()} for s in segments if s.text.strip()]


async def run(data: bytes, language: str | None) -> list[dict]:
    if os.getenv("TRANSCRIBE_DISABLED") == "1":
        raise Unavailable("disabled")
    return await asyncio.to_thread(_transcribe, data, language)
