"""Optional text recognition for photos of handwritten or printed papers (the `tesseract` program).

Install tesseract and the language packs you need (Arabic, English, French, Spanish) and set OCR_LANGS
(default "ara+eng+fra+spa"). Without tesseract the service answers 501 and the site asks the teacher to type
the answers instead.
"""

from __future__ import annotations

import asyncio
import os
import shutil
import subprocess
import tempfile


class Unavailable(Exception):
    pass


LANGS = {"ar": "ara", "en": "eng", "fr": "fra", "es": "spa"}


def _recognize(data: bytes, language: str | None) -> str:
    exe = shutil.which("tesseract")
    if not exe:
        raise Unavailable("tesseract is not installed")
    lang = LANGS.get(language or "", None) or os.getenv("OCR_LANGS", "ara+eng+fra+spa")
    if language and language in LANGS:
        # A single language reads its own script best, but a mixed paper (Arabic with Latin numbers) needs English too.
        lang = f"{LANGS[language]}+eng" if language != "en" else "eng"
    with tempfile.TemporaryDirectory() as tmp:
        path = os.path.join(tmp, "page")
        with open(path, "wb") as f:
            f.write(data)
        try:
            out = subprocess.run([exe, path, "stdout", "-l", lang, "--psm", "6"], capture_output=True, timeout=90, check=False)
        except subprocess.TimeoutExpired as e:
            raise Unavailable("timeout") from e
        if out.returncode != 0:
            # Missing language pack: fall back to English so the teacher still gets something to correct.
            out = subprocess.run([exe, path, "stdout", "-l", "eng", "--psm", "6"], capture_output=True, timeout=90, check=False)
            if out.returncode != 0:
                raise Unavailable("tesseract failed")
        return out.stdout.decode("utf-8", errors="replace").strip()


async def run(data: bytes, language: str | None) -> str:
    if os.getenv("OCR_DISABLED") == "1":
        raise Unavailable("disabled")
    return await asyncio.to_thread(_recognize, data, language)
