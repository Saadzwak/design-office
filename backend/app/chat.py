"""Cross-page chat — 'Ask Archoff'.

A single Opus 4.7 agent accessible as a floating drawer on every page
and as a full-page route. Receives :

- a conversation history (user + assistant turns)
- a structured `page_context` describing what the user is looking at
  (current surface, brief text, programme, variants, retained variant,
  argumentaire…)

Returns a single assistant turn in Markdown. The agent may end with a
`design-office-action` JSON fence — the frontend parses it out and
renders a confirm button for the user.

Streaming is served as text/event-stream with two event types :
- `token` with `{ "text": "..." }`
- `end`   with `{ "usage": { "input": ..., "output": ... } }`
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Iterator, Literal

from pydantic import BaseModel, Field

from app.claude_client import ClaudeClient
from app.config import get_settings

PROMPTS_DIR = Path(__file__).resolve().parent / "prompts" / "agents"
SYSTEM_PROMPT_PATH = PROMPTS_DIR / "chat_assistant.md"


PageName = Literal["landing", "brief", "testfit", "moodboard", "justify", "export", "chat"]


class ChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str


class PageContext(BaseModel):
    page: PageName
    data: dict[str, Any] = Field(default_factory=dict)


class ChatRequest(BaseModel):
    messages: list[ChatMessage] = Field(..., min_length=1)
    page_context: PageContext
    max_tokens: int = Field(default=2000, ge=100, le=8000)


class ChatResponse(BaseModel):
    reply: str
    tokens: dict[str, int]
    duration_ms: int
    suggested_action: dict[str, Any] | None = None


def _system_prompt(ctx: PageContext) -> str:
    base = SYSTEM_PROMPT_PATH.read_text(encoding="utf-8")
    # Inject a condensed view of the page context into the system prompt so
    # Opus always sees the up-to-date state. We stringify with default=str to
    # tolerate arbitrary JSON-serialisable payloads the frontend may pass.
    page_data_json = json.dumps(ctx.data, ensure_ascii=False, default=str)
    return (
        f"{base}\n\n"
        f"---\n\n"
        f"## Live page context\n\n"
        f"**Current page** : `{ctx.page}`\n\n"
        f"<page_context>\n{page_data_json}\n</page_context>\n"
    )


def _to_anthropic_messages(messages: list[ChatMessage]) -> list[dict[str, Any]]:
    """Anthropic requires alternating user/assistant turns starting with
    user. Our frontend should already respect that, but we collapse any
    consecutive messages of the same role to be defensive.
    """

    cleaned: list[dict[str, Any]] = []
    for msg in messages:
        if cleaned and cleaned[-1]["role"] == msg.role:
            cleaned[-1]["content"] += "\n\n" + msg.content
        else:
            cleaned.append({"role": msg.role, "content": msg.content})
    # Drop trailing assistant message — Anthropic expects the last message to
    # be from the user for a completion call.
    while cleaned and cleaned[-1]["role"] == "assistant":
        cleaned.pop()
    return cleaned


_ACTION_FENCE_RE = None  # lazy-compiled


def extract_action(text: str) -> tuple[str, dict[str, Any] | None]:
    """Pull a trailing `design-office-action` fence out of the reply.

    Returns (reply_text_without_fence, action_dict_or_none).
    The fence may use either 3 or more backticks. We tolerate any trailing
    whitespace / prose after the fence but expect it to be at the tail.
    """

    import re

    global _ACTION_FENCE_RE
    if _ACTION_FENCE_RE is None:
        _ACTION_FENCE_RE = re.compile(
            r"```+\s*design-office-action\s*\n(.*?)\n\s*```+\s*$",
            flags=re.DOTALL,
        )
    match = _ACTION_FENCE_RE.search(text)
    if not match:
        return text, None
    body = match.group(1).strip()
    try:
        action = json.loads(body)
    except json.JSONDecodeError:
        return text, None
    # Strip the fence from the visible reply.
    reply_text = text[: match.start()].rstrip()
    return reply_text, action


def run_chat(request: ChatRequest, client: ClaudeClient | None = None) -> ChatResponse:
    """Non-streaming variant. Keeps the hot path simple for tests and for
    the chat drawer on modest connections.
    """

    import time

    settings = get_settings()
    client = client or ClaudeClient()
    messages = _to_anthropic_messages(request.messages)
    if not messages:
        raise ValueError("chat request has no user-role message to reply to")

    t0 = time.time()
    response = client.messages_create(
        tag=f"chat.{request.page_context.page}",
        system=_system_prompt(request.page_context),
        messages=messages,
        max_tokens=request.max_tokens,
    )
    duration_ms = int((time.time() - t0) * 1000)
    text = "".join(
        block.text for block in response.content if getattr(block, "type", None) == "text"
    )
    reply, action = extract_action(text)

    # Silence unused import of settings (kept for future model-per-request overrides).
    _ = settings
    return ChatResponse(
        reply=reply,
        tokens={
            "input": getattr(response.usage, "input_tokens", 0),
            "output": getattr(response.usage, "output_tokens", 0),
        },
        duration_ms=duration_ms,
        suggested_action=action,
    )


def run_chat_stream(request: ChatRequest) -> Iterator[bytes]:
    """Server-sent event stream. Each event is a `data: <json>\\n\\n` line.

    Events :
    - `token`  → `{ "text": "<chunk>" }` as chunks arrive
    - `end`    → `{ "tokens": {"input": N, "output": N}, "suggested_action": {...}|null }`
    """

    from anthropic import Anthropic

    settings = get_settings()
    if not settings.anthropic_api_key:
        yield _sse("error", {"message": "ANTHROPIC_API_KEY not loaded"})
        return

    anth = Anthropic(api_key=settings.anthropic_api_key)
    messages = _to_anthropic_messages(request.messages)
    if not messages:
        yield _sse("error", {"message": "no user message to reply to"})
        return

    buffer: list[str] = []
    with anth.messages.stream(
        model=settings.anthropic_model,
        system=_system_prompt(request.page_context),
        messages=messages,
        max_tokens=request.max_tokens,
    ) as stream:
        for chunk in stream.text_stream:
            if chunk:
                buffer.append(chunk)
                yield _sse("token", {"text": chunk})
        final_message = stream.get_final_message()

    full_text = "".join(buffer)
    reply, action = extract_action(full_text)
    yield _sse(
        "end",
        {
            "tokens": {
                "input": getattr(final_message.usage, "input_tokens", 0),
                "output": getattr(final_message.usage, "output_tokens", 0),
            },
            "suggested_action": action,
            # Also include the reply stripped of the action fence so the
            # frontend can replace its accumulated buffer in one pass.
            "reply": reply,
        },
    )


def _sse(event: str, data: dict[str, Any]) -> bytes:
    return (
        f"event: {event}\n"
        f"data: {json.dumps(data, ensure_ascii=False)}\n\n"
    ).encode("utf-8")
