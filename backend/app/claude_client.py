"""Opus 4.7 client — retries, structured logs, lazy SDK init.

Design rules (per Phase-4+ quality directive):
- Every call is logged as one JSONL line with tag, model, tokens, latency
  and outcome. No silent successes, no silent failures.
- Retryable errors (5xx, 429, network) back off exponentially up to 4
  attempts before surfacing. `overloaded_error` from Anthropic is treated
  as retryable.
- The tag carries the call site so the log is auditable during demos
  (grep for `tag` to reconstruct a run).
"""

from __future__ import annotations

import json
import logging
import random
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Callable

from app.config import get_settings

_LOG_PATH = Path(__file__).resolve().parent.parent / "logs" / "api_calls.jsonl"

_logger = logging.getLogger("design_office.claude")
if not _logger.handlers:
    handler = logging.StreamHandler()
    handler.setFormatter(logging.Formatter("%(asctime)s %(levelname)s %(name)s %(message)s"))
    _logger.addHandler(handler)
    _logger.setLevel(logging.INFO)


@dataclass(frozen=True)
class CallRecord:
    timestamp: float
    model: str
    input_tokens: int
    output_tokens: int
    duration_ms: int
    tag: str
    attempts: int = 1
    outcome: str = "success"
    error_class: str | None = None
    error_message: str | None = None


def log_call(record: CallRecord) -> None:
    _LOG_PATH.parent.mkdir(parents=True, exist_ok=True)
    with _LOG_PATH.open("a", encoding="utf-8") as fh:
        fh.write(json.dumps(record.__dict__) + "\n")


# Exceptions that are safe to retry. Everything else (auth, invalid request,
# schema mismatch) is a programmer error and must surface immediately.
_RETRYABLE_MARKERS = (
    "overloaded",
    "rate_limit",
    "timeout",
    "timed out",
    "connection",
    "ReadTimeout",
    "Remote end closed",
    "temporarily unavailable",
)


def _is_retryable(exc: BaseException) -> bool:
    from anthropic import APIConnectionError, APIStatusError, APITimeoutError, RateLimitError

    if isinstance(exc, (APIConnectionError, APITimeoutError, RateLimitError)):
        return True
    if isinstance(exc, APIStatusError):
        status = getattr(exc, "status_code", 0) or 0
        if status >= 500 or status == 429:
            return True
        body = (str(exc) or "").lower()
        if any(marker in body for marker in _RETRYABLE_MARKERS):
            return True
    return False


class ClaudeClient:
    """Lazy-initialised Opus 4.7 client with retries and structured logs."""

    def __init__(
        self,
        *,
        max_attempts: int = 4,
        base_delay_s: float = 1.5,
        max_delay_s: float = 20.0,
    ) -> None:
        settings = get_settings()
        if not settings.anthropic_api_key:
            raise RuntimeError(
                "ANTHROPIC_API_KEY is not set. Copy .env.example to .env and fill in a fresh key."
            )
        from anthropic import Anthropic

        self._client = Anthropic(api_key=settings.anthropic_api_key)
        self._model = settings.anthropic_model
        self._max_attempts = max_attempts
        self._base_delay_s = base_delay_s
        self._max_delay_s = max_delay_s

    def _with_retry(
        self, tag: str, call: Callable[[], Any]
    ) -> Any:
        last_exc: BaseException | None = None
        start = time.time()
        for attempt in range(1, self._max_attempts + 1):
            try:
                response = call()
                duration_ms = int((time.time() - start) * 1000)
                log_call(
                    CallRecord(
                        timestamp=start,
                        model=self._model,
                        input_tokens=getattr(response.usage, "input_tokens", 0),
                        output_tokens=getattr(response.usage, "output_tokens", 0),
                        duration_ms=duration_ms,
                        tag=tag,
                        attempts=attempt,
                        outcome="success",
                    )
                )
                if attempt > 1:
                    _logger.info(
                        "tag=%s attempts=%d success after retries", tag, attempt
                    )
                return response
            except Exception as exc:  # noqa: BLE001
                last_exc = exc
                if not _is_retryable(exc) or attempt == self._max_attempts:
                    duration_ms = int((time.time() - start) * 1000)
                    log_call(
                        CallRecord(
                            timestamp=start,
                            model=self._model,
                            input_tokens=0,
                            output_tokens=0,
                            duration_ms=duration_ms,
                            tag=tag,
                            attempts=attempt,
                            outcome="error",
                            error_class=type(exc).__name__,
                            error_message=str(exc)[:500],
                        )
                    )
                    _logger.exception(
                        "tag=%s attempts=%d failed: %s", tag, attempt, exc
                    )
                    raise
                delay = min(
                    self._max_delay_s,
                    self._base_delay_s * (2 ** (attempt - 1)) + random.uniform(0, 0.5),
                )
                _logger.warning(
                    "tag=%s attempt=%d/%d retryable: %s — sleeping %.1fs",
                    tag,
                    attempt,
                    self._max_attempts,
                    type(exc).__name__,
                    delay,
                )
                time.sleep(delay)
        assert last_exc is not None
        raise last_exc

    def messages_create(self, *, tag: str, **kwargs: Any) -> Any:
        return self._with_retry(tag, lambda: self._client.messages.create(model=self._model, **kwargs))
