"""Optional Claude integration for grounded assistant replies.

Disabled unless AI_PROVIDER=anthropic and credentials are configured; the built-in engine
always works without any external call. Answers are grounded on the retrieved course and
knowledge-base context passed in by the API.
"""

from __future__ import annotations

import logging
import os
from dataclasses import dataclass

log = logging.getLogger("qubedu_ai.llm")

SYSTEM_PROMPT = """You are Qubedu's study assistant for school and university students.
Answer in the same language as the student's message (Arabic, English, French or Spanish).
Ground your answer in the provided context when it is relevant, and say plainly when the context does not contain the answer instead of inventing facts.
Explain step by step when the student is learning a concept, keep answers concise, and use simple formatting (short paragraphs, lists) that renders well in a chat bubble.
Do not complete graded exams on a student's behalf; guide them to understand instead."""


@dataclass
class LlmReply:
    text: str
    provider: str


class ClaudeProvider:
    """Uses the official Anthropic SDK (async client) with server-side refusal fallbacks."""

    def __init__(self, model: str, effort: str, timeout: float) -> None:
        import anthropic

        self._anthropic = anthropic
        self.model = model
        self.effort = effort
        # SDK retries 408/409/429/5xx and connection errors itself (max_retries).
        self.client = anthropic.AsyncAnthropic(timeout=timeout, max_retries=2)

    async def reply(self, message: str, history: list[dict], context: str, language: str) -> LlmReply | None:
        anthropic = self._anthropic
        messages: list[dict] = []
        for h in history[-8:]:
            role = "assistant" if h.get("role") == "assistant" else "user"
            content = str(h.get("content", ""))[:4000]
            if content:
                messages.append({"role": role, "content": content})
        # The conversation must start with a user turn.
        while messages and messages[0]["role"] != "user":
            messages.pop(0)
        grounded = f'<context>\n{context}\n</context>\n\n<question lang="{language}">\n{message}\n</question>' if context else message
        messages.append({"role": "user", "content": grounded})
        try:
            response = await self.client.beta.messages.create(
                model=self.model,
                max_tokens=16000,
                system=SYSTEM_PROMPT,
                messages=messages,
                output_config={"effort": self.effort},
                betas=["server-side-fallback-2026-07-01"],
                fallbacks="default",
            )
        except anthropic.AuthenticationError:
            log.error("Claude authentication failed - check ANTHROPIC_API_KEY")
            return None
        except anthropic.RateLimitError:
            log.warning("Claude rate limited")
            return None
        except anthropic.BadRequestError as e:
            log.warning("Claude rejected the request: %s", e.message)
            return None
        except anthropic.APIStatusError as e:
            log.warning("Claude API error %s", e.status_code)
            return None
        except anthropic.APIConnectionError:
            log.warning("Claude connection error")
            return None
        if response.stop_reason == "refusal":
            return None
        text = "".join(block.text for block in response.content if block.type == "text").strip()
        if not text:
            return None
        return LlmReply(text=text, provider=f"anthropic:{response.model}")


def build_provider() -> ClaudeProvider | None:
    if os.getenv("AI_PROVIDER", "local").lower() != "anthropic":
        return None
    try:
        return ClaudeProvider(
            model=os.getenv("AI_MODEL", "claude-opus-5-5"),
            effort=os.getenv("AI_EFFORT", "low"),
            timeout=float(os.getenv("AI_TIMEOUT_SECONDS", "45")),
        )
    except ImportError:
        log.error("AI_PROVIDER=anthropic but the 'anthropic' package is not installed")
        return None
