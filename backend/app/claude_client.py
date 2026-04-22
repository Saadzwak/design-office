"""Thin wrapper around the Anthropic SDK — Phase 1 stub, wired up in Phase 2."""

from __future__ import annotations

import json
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from app.config import get_settings

_LOG_PATH = Path(__file__).resolve().parent.parent / "logs" / "api_calls.jsonl"


@dataclass(frozen=True)
class CallRecord:
    timestamp: float
    model: str
    input_tokens: int
    output_tokens: int
    duration_ms: int
    tag: str


def log_call(record: CallRecord) -> None:
    _LOG_PATH.parent.mkdir(parents=True, exist_ok=True)
    with _LOG_PATH.open("a", encoding="utf-8") as fh:
        fh.write(json.dumps(record.__dict__) + "\n")


class ClaudeClient:
    """Lazy-initialised Opus 4.7 client. Instantiating is cheap; first call hits the API."""

    def __init__(self) -> None:
        settings = get_settings()
        if not settings.anthropic_api_key:
            raise RuntimeError(
                "ANTHROPIC_API_KEY is not set. Copy .env.example to .env and fill in a fresh key."
            )
        from anthropic import Anthropic

        self._client = Anthropic(api_key=settings.anthropic_api_key)
        self._model = settings.anthropic_model

    def messages_create(self, *, tag: str, **kwargs: Any) -> Any:
        start = time.time()
        response = self._client.messages.create(model=self._model, **kwargs)
        duration_ms = int((time.time() - start) * 1000)
        log_call(
            CallRecord(
                timestamp=start,
                model=self._model,
                input_tokens=getattr(response.usage, "input_tokens", 0),
                output_tokens=getattr(response.usage, "output_tokens", 0),
                duration_ms=duration_ms,
                tag=tag,
            )
        )
        return response
