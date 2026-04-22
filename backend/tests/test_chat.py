from __future__ import annotations

import json
from typing import Any

from fastapi.testclient import TestClient

from app.chat import ChatMessage, ChatRequest, PageContext, extract_action, run_chat
from app.main import app


class _FakeResponse:
    def __init__(self, text: str, in_tokens: int = 120, out_tokens: int = 40):
        self.usage = type("U", (), {"input_tokens": in_tokens, "output_tokens": out_tokens})()
        block = type("B", (), {"text": text, "type": "text"})()
        self.content = [block]


class _FakeClient:
    def __init__(self, text: str) -> None:
        self._text = text
        self.last_kwargs: dict[str, Any] | None = None

    def messages_create(self, **kwargs: Any) -> _FakeResponse:
        self.last_kwargs = kwargs
        return _FakeResponse(self._text)


def test_extract_action_with_fence() -> None:
    text = (
        "Sure. I propose to enlarge the boardroom.\n\n"
        "```design-office-action\n"
        '{"type":"iterate_variant","label":"Agrandir la boardroom",'
        '"params":{"instruction":"enlarge boardroom","style":"atelier"}}\n'
        "```"
    )
    reply, action = extract_action(text)
    assert "enlarge the boardroom" in reply
    assert "design-office-action" not in reply
    assert action is not None
    assert action["type"] == "iterate_variant"
    assert action["params"]["style"] == "atelier"


def test_extract_action_without_fence_returns_original() -> None:
    text = "Just a normal answer."
    reply, action = extract_action(text)
    assert reply == text
    assert action is None


def test_extract_action_tolerates_trailing_whitespace() -> None:
    text = "answer\n\n```design-office-action\n{\"type\":\"regenerate_variants\",\"label\":\"redo\",\"params\":{}}\n```\n\n  "
    reply, action = extract_action(text)
    assert reply == "answer"
    assert action == {"type": "regenerate_variants", "label": "redo", "params": {}}


def test_extract_action_ignores_malformed_json() -> None:
    text = "intro\n\n```design-office-action\nnot json at all\n```"
    reply, action = extract_action(text)
    assert reply == text
    assert action is None


def test_run_chat_with_stubbed_client_returns_reply_and_action() -> None:
    fake = _FakeClient(
        "Les 130 postes tiennent à 0.75 seat/FTE.\n\n"
        "```design-office-action\n"
        '{"type":"regenerate_argumentaire","label":"Regenerer Justify","params":{"style":"atelier"}}\n'
        "```"
    )
    req = ChatRequest(
        messages=[ChatMessage(role="user", content="Combien de postes ?")],
        page_context=PageContext(page="testfit", data={"retained_style": "atelier"}),
    )
    response = run_chat(req, client=fake)
    assert "130 postes" in response.reply
    assert response.suggested_action is not None
    assert response.suggested_action["type"] == "regenerate_argumentaire"
    # System prompt must carry the live page context.
    system = fake.last_kwargs["system"] if fake.last_kwargs else ""
    assert "testfit" in system
    assert "retained_style" in system


def test_chat_message_endpoint_rejects_empty_messages() -> None:
    client = TestClient(app)
    r = client.post(
        "/api/chat/message",
        json={"messages": [], "page_context": {"page": "brief", "data": {}}},
    )
    assert r.status_code == 422


def test_to_anthropic_messages_drops_trailing_assistant() -> None:
    # Ensures the helper used inside run_chat is defensive.
    from app.chat import _to_anthropic_messages

    msgs = [
        ChatMessage(role="user", content="hi"),
        ChatMessage(role="assistant", content="hello"),
        ChatMessage(role="user", content="what's up"),
        ChatMessage(role="assistant", content="awaiting reply"),
    ]
    out = _to_anthropic_messages(msgs)
    assert out[-1]["role"] == "user"
    assert out[-1]["content"] == "what's up"
    assert len(out) == 3
