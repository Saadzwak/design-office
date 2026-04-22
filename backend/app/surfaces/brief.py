"""Surface 1 — Brief synthesis."""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from pydantic import BaseModel, Field

from app.agents.orchestrator import Orchestration, SubAgent

BACKEND_ROOT = Path(__file__).resolve().parent.parent
PROMPTS_DIR = BACKEND_ROOT / "prompts" / "agents"
RESOURCES_DIR = BACKEND_ROOT / "data" / "resources"
BENCHMARKS_DIR = BACKEND_ROOT / "data" / "benchmarks"

# Which MCP resources are injected into each agent. Keep the payload small:
# full files can be 200 lines, we extract each file in full (they are within
# the 200k context budget of Opus 4.7).

RESOURCES_FOR_EFFECTIFS = [
    "office-programming.md",
    "flex-ratios.md",
    "collaboration-spaces.md",
]

RESOURCES_FOR_BENCHMARKS = [
    "office-programming.md",
    "flex-ratios.md",
    "neuroarchitecture.md",
    "biophilic-office.md",
]

RESOURCES_FOR_CONTRAINTES = [
    "erp-safety.md",
    "pmr-requirements.md",
    "ergonomic-workstation.md",
    "acoustic-standards.md",
]


class BriefRequest(BaseModel):
    brief: str = Field(..., min_length=50, description="Client brief, free text.")
    client_name: str | None = None
    language: str = Field(default="fr")


class BriefResponse(BaseModel):
    programme: str
    trace: list[dict[str, Any]]
    tokens: dict[str, int]


def _read(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def _load_resources(filenames: list[str]) -> str:
    blocks = []
    for name in filenames:
        p = RESOURCES_DIR / name
        blocks.append(f"# FILE: design://{p.stem}\n\n{_read(p)}")
    return "\n\n---\n\n".join(blocks)


def _ratios_json() -> str:
    return _read(BENCHMARKS_DIR / "ratios.json")


def _agent(name: str, prompt_file: str, user_template: str, max_tokens: int = 4096) -> SubAgent:
    system = _read(PROMPTS_DIR / prompt_file)
    return SubAgent(
        name=name,
        system_prompt=system,
        user_template=user_template,
        max_tokens=max_tokens,
    )


_EFFECTIFS_USER = """Client brief (text, language detected from content):

<brief>
{brief}
</brief>

Client name (if known): {client_name}

MCP resources you may cite (use these URIs inline, e.g. `see design://office-programming §4`):

<resources_excerpts>
{effectifs_resources}
</resources_excerpts>

Machine-readable ratios (cite figures from here with the JSON path):

<ratios_json>
{ratios_json}
</ratios_json>

Produce the Effectifs output per your system instructions. Return only the Markdown."""

_BENCHMARKS_USER = """Client brief:

<brief>
{brief}
</brief>

Client name: {client_name}

MCP resources you may cite:

<resources_excerpts>
{benchmarks_resources}
</resources_excerpts>

Machine-readable ratios:

<ratios_json>
{ratios_json}
</ratios_json>

Effectifs Agent preliminary output (for cross-check):

<sub_outputs>
{sub_outputs_placeholder}
</sub_outputs>

Produce the Benchmarks memo per your system instructions. Return only the Markdown."""

_CONTRAINTES_USER = """Client brief:

<brief>
{brief}
</brief>

Client name: {client_name}

MCP resources you may cite:

<resources_excerpts>
{contraintes_resources}
</resources_excerpts>

Produce the Contraintes memo per your system instructions. Return only the Markdown."""

_CONSOLIDATOR_USER = """Client brief:

<brief>
{brief}
</brief>

Client name: {client_name}
Output language: {language}

Sub-agent outputs:

<sub_outputs>
{sub_outputs}
</sub_outputs>

Consolidate per your system instructions. Return only the Markdown."""


@dataclass
class BriefSurface:
    orchestration: Orchestration

    def synthesize(self, request: BriefRequest) -> BriefResponse:
        client_name = request.client_name or "Client"
        effectifs = _agent("Effectifs", "brief_effectifs.md", _EFFECTIFS_USER, max_tokens=6000)
        benchmarks = _agent("Benchmarks", "brief_benchmarks.md", _BENCHMARKS_USER, max_tokens=4000)
        contraintes = _agent(
            "Contraintes", "brief_contraintes.md", _CONTRAINTES_USER, max_tokens=4000
        )
        consolidator = _agent(
            "Consolidator",
            "brief_consolidator.md",
            _CONSOLIDATOR_USER,
            max_tokens=8000,
        )

        context = {
            "brief": request.brief,
            "client_name": client_name,
            "language": request.language,
            "effectifs_resources": _load_resources(RESOURCES_FOR_EFFECTIFS),
            "benchmarks_resources": _load_resources(RESOURCES_FOR_BENCHMARKS),
            "contraintes_resources": _load_resources(RESOURCES_FOR_CONTRAINTES),
            "ratios_json": _ratios_json(),
            "sub_outputs_placeholder": "(Effectifs will run in parallel; use the ratios_json as your programme split reference.)",
            "sub_outputs": "",  # filled by orchestrator
        }

        result = self.orchestration.run_with_consolidator(
            agents=[effectifs, benchmarks, contraintes],
            consolidator=consolidator,
            context=context,
            tag="brief.synthesize",
        )

        trace = [
            {
                "name": o.name,
                "text": o.text,
                "tokens": {"input": o.input_tokens, "output": o.output_tokens},
                "duration_ms": o.duration_ms,
            }
            for o in result.sub_outputs
        ]
        return BriefResponse(
            programme=result.consolidated_text,
            trace=trace,
            tokens={
                "input": result.total_input_tokens,
                "output": result.total_output_tokens,
            },
        )


def compile_default_surface() -> BriefSurface:
    return BriefSurface(orchestration=Orchestration())


def preview_resources_manifest() -> dict[str, Any]:
    """Quick utility for the frontend to display which resources are wired in."""
    return {
        "resources_dir": str(RESOURCES_DIR),
        "files": sorted(p.name for p in RESOURCES_DIR.glob("*.md")),
        "ratios_json_size_bytes": (BENCHMARKS_DIR / "ratios.json").stat().st_size,
        "benchmarks_version": json.loads(_ratios_json()).get("version"),
    }
