"""Managed-agent orchestrator.

Runs a fixed set of sub-agents in parallel over a shared context, then feeds
their outputs into a consolidator prompt. The pattern is reusable for all
three orchestration levels in the Design Office system.
"""

from __future__ import annotations

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


@dataclass
class Orchestration:
    client: ClaudeClient = field(default_factory=ClaudeClient)

    def run_subagent(self, agent: SubAgent, context: dict[str, str], tag: str) -> SubAgentOutput:
        user_msg = agent.user_template.format(**context)
        import time

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
