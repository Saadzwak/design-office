"""Managed-agent orchestrator.

Runs a fixed set of sub-agents in parallel over a shared context, then feeds
their outputs into a consolidator prompt. The pattern is reusable for all
three orchestration levels in the Design Office system.

iter-23 (Saad, 2026-04-24) — added `StructuredSubAgent` that uses the
Anthropic `tool_use` API for guaranteed-valid JSON output. When you
declare a schema, Claude fills a tool call whose `input` dict matches
the schema, instead of emitting freeform text we then `json.loads()`.
This eliminates the whole class of parse-error bugs (unescaped quotes,
trailing commas, truncated strings, control characters). Old `SubAgent`
kept unchanged so migration is incremental.
"""

from __future__ import annotations

import time
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field
from typing import Any

from app.claude_client import ClaudeClient


@dataclass(frozen=True)
class SubAgent:
    name: str
    system_prompt: str
    user_template: str
    max_tokens: int = 4096


@dataclass
class SubAgentOutput:
    name: str
    text: str
    input_tokens: int
    output_tokens: int
    duration_ms: int


@dataclass
class OrchestrationResult:
    sub_outputs: list[SubAgentOutput]
    consolidated_text: str
    total_input_tokens: int = 0
    total_output_tokens: int = 0

    def to_dict(self) -> dict[str, Any]:
        return {
            "sub_outputs": [
                {
                    "name": o.name,
                    "text": o.text,
                    "tokens": {"input": o.input_tokens, "output": o.output_tokens},
                    "duration_ms": o.duration_ms,
                }
                for o in self.sub_outputs
            ],
            "consolidated": self.consolidated_text,
            "tokens": {"input": self.total_input_tokens, "output": self.total_output_tokens},
        }


@dataclass(frozen=True)
class StructuredSubAgent:
    """iter-23 — tool_use-based agent with guaranteed-valid JSON output.

    The agent declares a JSON Schema for its expected output. The
    Anthropic API is instructed to populate a tool call whose `input`
    dict matches the schema. No text parsing, no json.loads, no
    defensive repair — the API validates the schema before returning.

    Use `pydantic.BaseModel.model_json_schema()` to generate
    `output_schema` from a typed dataclass. See `app/schemas.py` for
    the LLM-facing schemas shipped with iter-23.

    Note : Anthropic's tool schema is strict JSON Schema draft-2020-12
    BUT doesn't support every keyword. Known gotchas :
      - `$ref` / `$defs` work only if flattened into one object
      - `additionalProperties: false` is honoured
      - discriminated unions must use `anyOf` + a `const` property
    """

    name: str
    system_prompt: str
    user_template: str
    output_schema: dict[str, Any]
    tool_name: str = "emit_structured_output"
    tool_description: str = "Emit the structured output for this agent. Every field must match the schema ; no free-form narrative outside the declared fields."
    max_tokens: int = 8192


@dataclass
class StructuredSubAgentOutput:
    name: str
    data: dict[str, Any]
    input_tokens: int
    output_tokens: int
    duration_ms: int


@dataclass
class Orchestration:
    client: ClaudeClient = field(default_factory=ClaudeClient)

    def run_subagent(self, agent: SubAgent, context: dict[str, str], tag: str) -> SubAgentOutput:
        user_msg = agent.user_template.format(**context)
        start = time.time()
        response = self.client.messages_create(
            tag=f"{tag}:{agent.name}",
            system=agent.system_prompt,
            messages=[{"role": "user", "content": user_msg}],
            max_tokens=agent.max_tokens,
        )
        duration_ms = int((time.time() - start) * 1000)
        text = "".join(
            block.text for block in response.content if getattr(block, "type", None) == "text"
        )
        return SubAgentOutput(
            name=agent.name,
            text=text,
            input_tokens=response.usage.input_tokens,
            output_tokens=response.usage.output_tokens,
            duration_ms=duration_ms,
        )

    def run_structured_subagent(
        self,
        agent: StructuredSubAgent,
        context: dict[str, Any],
        tag: str,
    ) -> StructuredSubAgentOutput:
        """iter-23 — tool_use-based single agent call.

        Returns a `StructuredSubAgentOutput` whose `data` is the raw
        dict Claude put inside the tool call. The dict has already
        been validated against `agent.output_schema` by the API, so
        the caller can feed it straight into a Pydantic model (or
        trust its shape).

        Raises `RuntimeError` if Claude refuses to call the tool
        (should not happen with `tool_choice` forced, but keep the
        contract explicit).
        """

        user_msg = agent.user_template.format(**context)
        tools = [
            {
                "name": agent.tool_name,
                "description": agent.tool_description,
                "input_schema": agent.output_schema,
            }
        ]
        start = time.time()
        response = self.client.messages_create(
            tag=f"{tag}:{agent.name}",
            system=agent.system_prompt,
            messages=[{"role": "user", "content": user_msg}],
            max_tokens=agent.max_tokens,
            tools=tools,
            tool_choice={"type": "tool", "name": agent.tool_name},
        )
        duration_ms = int((time.time() - start) * 1000)
        data: dict[str, Any] | None = None
        for block in response.content:
            if getattr(block, "type", None) == "tool_use":
                block_input = getattr(block, "input", None)
                if isinstance(block_input, dict):
                    data = block_input
                    break
        if data is None:
            raise RuntimeError(
                f"StructuredSubAgent '{agent.name}' did not emit a tool_use block"
                f" even though tool_choice forced it. Response content types :"
                f" {[getattr(b, 'type', None) for b in response.content]}"
            )
        return StructuredSubAgentOutput(
            name=agent.name,
            data=data,
            input_tokens=response.usage.input_tokens,
            output_tokens=response.usage.output_tokens,
            duration_ms=duration_ms,
        )

    def run_parallel_agents(
        self,
        agents: list[SubAgent],
        context: dict[str, str],
        tag: str,
    ) -> list[SubAgentOutput]:
        with ThreadPoolExecutor(max_workers=len(agents)) as pool:
            futures = [pool.submit(self.run_subagent, a, context, tag) for a in agents]
            return [f.result() for f in futures]

    def run_with_consolidator(
        self,
        agents: list[SubAgent],
        consolidator: SubAgent,
        context: dict[str, str],
        tag: str,
    ) -> OrchestrationResult:
        sub_outputs = self.run_parallel_agents(agents, context, tag)

        consolidator_context = dict(context)
        consolidator_context["sub_outputs"] = "\n\n---\n\n".join(
            f"# {o.name}\n\n{o.text}" for o in sub_outputs
        )
        consolidated = self.run_subagent(consolidator, consolidator_context, tag)

        total_in = sum(o.input_tokens for o in sub_outputs) + consolidated.input_tokens
        total_out = sum(o.output_tokens for o in sub_outputs) + consolidated.output_tokens
        return OrchestrationResult(
            sub_outputs=sub_outputs + [consolidated],
            consolidated_text=consolidated.text,
            total_input_tokens=total_in,
            total_output_tokens=total_out,
        )
