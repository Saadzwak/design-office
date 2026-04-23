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


# ---------------------------------------------------------------------------
# Live transcript shape assertions
#
# Three representative live Opus 4.7 responses are committed under
# `tests/fixtures/chat/` after being captured against the running backend
# in iteration 17. These tests don't replay them — they assert the shape
# so that if the allow-list or the system prompt drifts we notice the
# demo-critical behaviours breaking before Saad does.
# ---------------------------------------------------------------------------


def _load_chat_fixture(name: str) -> dict[str, Any]:
    from pathlib import Path

    fx = Path(__file__).resolve().parent / "fixtures" / "chat" / name
    return json.loads(fx.read_text(encoding="utf-8"))


def test_live_fixture_enrichment_headcount_emits_update_project_field() -> None:
    """Chat detects a natural-language headcount change and proposes the
    right action. Canonical for the "chat enriches the project" beat of
    the demo.
    """

    data = _load_chat_fixture("enrichment_headcount.json")
    resp = data["response"]
    action = resp["suggested_action"]
    assert action is not None
    assert action["type"] == "update_project_field"
    assert action["params"]["field"] == "headcount"
    assert action["params"]["value"] == "160"
    # The reply should reference the sizing impact, not just echo.
    assert "flex" in resp["reply"].lower()


def test_live_fixture_action_start_brief_is_dispatched() -> None:
    """Asking the chat to run the brief must emit `start_brief` — not
    some hallucinated variant."""

    data = _load_chat_fixture("action_start_brief.json")
    action = data["response"]["suggested_action"]
    assert action is not None
    assert action["type"] == "start_brief"
    assert action["params"] == {}


def test_live_fixture_out_of_domain_refused_without_action() -> None:
    """Out-of-domain electrical / TGBT request must be refused with
    no suggested action (this is the exact bug from iter-16 that the
    tightened allow-list fixed)."""

    data = _load_chat_fixture("out_of_domain_tgbt.json")
    resp = data["response"]
    assert resp["suggested_action"] is None
    lowered = resp["reply"].lower()
    assert "outside my scope" in lowered or "not electrical" in lowered or "mep" in lowered
