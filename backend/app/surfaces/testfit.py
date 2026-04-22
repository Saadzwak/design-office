"""Surface 2 — Test Fit (3 variants in parallel + Reviewer)."""

from __future__ import annotations

import json
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from pathlib import Path

from pydantic import BaseModel, Field

from app.agents.orchestrator import Orchestration, SubAgent, SubAgentOutput
from app.claude_client import ClaudeClient
from app.mcp.sketchup_client import SketchUpFacade, get_backend
from app.models import (
    FloorPlan,
    ReviewerVerdict,
    TestFitResponse,
    VariantMetrics,
    VariantOutput,
    VariantStyle,
)

BACKEND_ROOT = Path(__file__).resolve().parent.parent
PROMPTS_DIR = BACKEND_ROOT / "prompts" / "agents"
RESOURCES_DIR = BACKEND_ROOT / "data" / "resources"
BENCHMARKS_DIR = BACKEND_ROOT / "data" / "benchmarks"
FURNITURE_DIR = BACKEND_ROOT / "data" / "furniture"

VARIANT_RESOURCES = [
    "office-programming.md",
    "collaboration-spaces.md",
    "acoustic-standards.md",
    "biophilic-office.md",
]

REVIEWER_RESOURCES = [
    "pmr-requirements.md",
    "erp-safety.md",
    "office-programming.md",
]


def _read(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def _load_resources(filenames: list[str]) -> str:
    return "\n\n---\n\n".join(
        f"# FILE: design://{(RESOURCES_DIR / n).stem}\n\n{_read(RESOURCES_DIR / n)}" for n in filenames
    )


class TestFitRequest(BaseModel):
    plan_pdf_path: str | None = Field(
        default=None, description="Local path to the plan PDF. Mutually exclusive with plan_bytes."
    )
    programme_markdown: str = Field(..., description="Output of the Brief surface.")
    client_name: str = "Client"
    use_vision: bool = Field(
        default=True, description="Route the plan through Opus Vision HD when parsing."
    )
    styles: list[VariantStyle] = Field(
        default_factory=lambda: [
            VariantStyle.VILLAGEOIS,
            VariantStyle.ATELIER,
            VariantStyle.HYBRIDE_FLEX,
        ]
    )
    parse_only: bool = Field(
        default=False,
        description="If true, only parse the PDF and return the FloorPlan (skip variant generation).",
    )


_VARIANT_USER = """Client name : {client_name}
Style directive : {style_value}

Client brief and consolidated programme :

<programme>
{programme_markdown}
</programme>

Floor plan (mm, origin bottom-left) :

<floor_plan_json>
{floor_plan_json}
</floor_plan_json>

Furniture catalogue :

<catalog_json>
{catalog_json}
</catalog_json>

Planning ratios :

<ratios_json>
{ratios_json}
</ratios_json>

Relevant MCP resources :

<resources_excerpts>
{variant_resources}
</resources_excerpts>

Emit the JSON plan per your system instructions. Return only the JSON."""


_REVIEWER_USER = """Floor plan :

<floor_plan_json>
{floor_plan_json}
</floor_plan_json>

Programme :

<programme>
{programme_markdown}
</programme>

Variant to review :

<variant_json>
{variant_json}
</variant_json>

Regulatory references :

<resources_excerpts>
{reviewer_resources}
</resources_excerpts>

Emit the verdict JSON per your system instructions. Return only the JSON."""


@dataclass
class TestFitSurface:
    orchestration: Orchestration

    def _make_variant_agents(self) -> list[SubAgent]:
        system = _read(PROMPTS_DIR / "testfit_variant.md")
        return [
            SubAgent(
                name=style.value,
                system_prompt=system,
                user_template=_VARIANT_USER,
                max_tokens=6000,
            )
            for style in VariantStyle
        ]

    def _reviewer_agent(self) -> SubAgent:
        return SubAgent(
            name="Reviewer",
            system_prompt=_read(PROMPTS_DIR / "testfit_reviewer.md"),
            user_template=_REVIEWER_USER,
            max_tokens=1200,
        )

    def generate(
        self,
        floor_plan: FloorPlan,
        programme_markdown: str,
        client_name: str,
        styles: list[VariantStyle],
    ) -> TestFitResponse:
        catalog_json = (FURNITURE_DIR / "catalog.json").read_text(encoding="utf-8")
        ratios_json = (BENCHMARKS_DIR / "ratios.json").read_text(encoding="utf-8")
        variant_resources = _load_resources(VARIANT_RESOURCES)
        reviewer_resources = _load_resources(REVIEWER_RESOURCES)
        floor_plan_json = floor_plan.model_dump_json()

        system = _read(PROMPTS_DIR / "testfit_variant.md")
        agents = [
            (
                style,
                SubAgent(
                    name=style.value,
                    system_prompt=system,
                    user_template=_VARIANT_USER,
                    max_tokens=6000,
                ),
            )
            for style in styles
        ]

        base_context = {
            "client_name": client_name,
            "programme_markdown": programme_markdown,
            "floor_plan_json": floor_plan_json,
            "catalog_json": catalog_json,
            "ratios_json": ratios_json,
            "variant_resources": variant_resources,
            "reviewer_resources": reviewer_resources,
            "variant_json": "",
        }

        total_in = 0
        total_out = 0
        variants: list[VariantOutput] = []
        verdicts: list[ReviewerVerdict] = []

        # 1. Run variant generators in parallel.
        def _run(agent: SubAgent, style: VariantStyle) -> tuple[VariantStyle, SubAgentOutput]:
            ctx = dict(base_context)
            ctx["style_value"] = style.value
            return style, self.orchestration.run_subagent(agent, ctx, tag="testfit.variant")

        with ThreadPoolExecutor(max_workers=len(agents)) as pool:
            futures = [pool.submit(_run, a, s) for s, a in agents]
            results = [f.result() for f in futures]

        # 2. Replay each variant on the SketchUp (mock) backend and build
        #    VariantOutput.
        for style, sub_output in results:
            total_in += sub_output.input_tokens
            total_out += sub_output.output_tokens
            try:
                variant_json = _strip_json(sub_output.text)
                variant_obj = json.loads(variant_json)
            except Exception as exc:  # noqa: BLE001
                variant_obj = {
                    "style": style.value,
                    "title": f"{style.value} — parse error",
                    "narrative": f"Variant JSON could not be parsed: {exc}. Raw:\n{sub_output.text[:500]}",
                    "zones": [],
                    "metrics": {
                        "workstation_count": 0,
                        "meeting_room_count": 0,
                        "phone_booth_count": 0,
                        "collab_surface_m2": 0,
                        "amenity_surface_m2": 0,
                        "circulation_m2": 0,
                        "total_programmed_m2": 0,
                        "flex_ratio_applied": 0,
                        "notes": ["parse_error"],
                    },
                }

            facade = SketchUpFacade(backend=get_backend())
            facade.new_scene(name=f"{client_name} — {style.value}")
            _replay_floor_plan(facade, floor_plan)
            _replay_zones(facade, variant_obj.get("zones", []))
            shot = facade.screenshot(view_name="iso")

            metrics = VariantMetrics(**variant_obj.get("metrics", {}))
            variants.append(
                VariantOutput(
                    style=style,
                    title=variant_obj.get("title", style.value),
                    narrative=variant_obj.get("narrative", ""),
                    metrics=metrics,
                    sketchup_trace=facade.trace(),
                    screenshot_paths=[shot] if shot else [],
                )
            )

        # 3. Reviewer — one call per variant, in parallel.
        reviewer = self._reviewer_agent()

        def _review(style: VariantStyle, variant_json: str) -> tuple[VariantStyle, SubAgentOutput]:
            ctx = dict(base_context)
            ctx["variant_json"] = variant_json
            ctx["style_value"] = style.value
            return style, self.orchestration.run_subagent(
                reviewer, ctx, tag="testfit.reviewer"
            )

        pairs = [(v.style, _variant_to_json(v)) for v in variants]
        with ThreadPoolExecutor(max_workers=len(pairs)) as pool:
            rev_futures = [pool.submit(_review, s, j) for s, j in pairs]
            reviewer_results = [f.result() for f in rev_futures]

        for style, out in reviewer_results:
            total_in += out.input_tokens
            total_out += out.output_tokens
            try:
                payload = json.loads(_strip_json(out.text))
                verdicts.append(ReviewerVerdict(**payload))
            except Exception as exc:  # noqa: BLE001
                verdicts.append(
                    ReviewerVerdict(
                        style=style,
                        pmr_ok=False,
                        erp_ok=False,
                        programme_coverage_ok=False,
                        issues=[f"reviewer_parse_error: {exc}"],
                        verdict="rejected",
                    )
                )

        return TestFitResponse(
            floor_plan=floor_plan,
            variants=variants,
            verdicts=verdicts,
            tokens={"input": total_in, "output": total_out},
        )


def _variant_to_json(v: VariantOutput) -> str:
    return json.dumps(
        {
            "style": v.style.value,
            "title": v.title,
            "narrative": v.narrative,
            "zones": _zones_from_trace(v.sketchup_trace),
            "metrics": v.metrics.model_dump(),
        },
        ensure_ascii=False,
    )


def _zones_from_trace(trace: list[dict]) -> list[dict]:
    """Reverse-engineer the zone list from the recorded SketchUp trace so the
    Reviewer sees the same information the Variant Generator emitted.
    """

    zones: list[dict] = []
    for entry in trace:
        tool = entry["tool"]
        params = entry.get("params", {})
        if tool == "create_workstation_cluster":
            zones.append({"kind": "workstation_cluster", **params})
        elif tool == "create_meeting_room":
            zones.append({"kind": "meeting_room", **params})
        elif tool == "create_phone_booth":
            zones.append({"kind": "phone_booth", **params})
        elif tool == "create_collab_zone":
            zones.append({"kind": "collab_zone", **params})
        elif tool == "create_partition_wall":
            zones.append({"kind": "partition_wall", **params})
        elif tool == "apply_biophilic_zone":
            zones.append({"kind": "biophilic_zone", **params})
    return zones


def _replay_floor_plan(facade: SketchUpFacade, plan: FloorPlan) -> None:
    facade.draw_envelope([(p.x, p.y) for p in plan.envelope.points])
    for col in plan.columns:
        facade.place_column(col.center.x, col.center.y, col.radius_mm)
    for core in plan.cores:
        facade.place_core(core.kind, [(p.x, p.y) for p in core.outline.points])
    for stair in plan.stairs:
        facade.place_stair([(p.x, p.y) for p in stair.outline.points])


def _replay_zones(facade: SketchUpFacade, zones: list[dict]) -> None:
    for z in zones:
        kind = z.get("kind")
        if kind == "workstation_cluster":
            facade.create_workstation_cluster(
                origin_mm=tuple(z.get("origin_mm", [0, 0])),
                orientation_deg=float(z.get("orientation_deg", 0)),
                count=int(z.get("count", 1)),
                row_spacing_mm=int(z.get("row_spacing_mm", 1600)),
                product_id=str(z.get("product_id", "")),
            )
        elif kind == "meeting_room":
            facade.create_meeting_room(
                corner1_mm=tuple(z.get("corner1_mm", [0, 0])),
                corner2_mm=tuple(z.get("corner2_mm", [0, 0])),
                capacity=int(z.get("capacity", 0)),
                name=str(z.get("name", "meeting")),
                table_product=str(z.get("table_product", "")),
            )
        elif kind == "phone_booth":
            facade.create_phone_booth(
                position_mm=tuple(z.get("position_mm", [0, 0])),
                product_id=str(z.get("product_id", "framery_one_compact")),
            )
        elif kind == "partition_wall":
            facade.create_partition_wall(
                start_mm=tuple(z.get("start_mm", [0, 0])),
                end_mm=tuple(z.get("end_mm", [0, 0])),
                kind=str(z.get("kind_value", z.get("kind_wall", "acoustic"))),
            )
        elif kind == "collab_zone":
            facade.create_collab_zone(
                bbox_mm=tuple(z.get("bbox_mm", [0, 0, 0, 0])),
                style=str(z.get("style_value", z.get("style", "huddle_cluster"))),
            )
        elif kind == "biophilic_zone":
            facade.apply_biophilic_zone(bbox_mm=tuple(z.get("bbox_mm", [0, 0, 0, 0])))


def _strip_json(text: str) -> str:
    stripped = text.strip()
    if stripped.startswith("```"):
        stripped = stripped.split("```", 2)[1]
        if stripped.startswith("json"):
            stripped = stripped[len("json") :]
    # Take the outermost balanced braces
    start = stripped.find("{")
    end = stripped.rfind("}")
    if start != -1 and end != -1 and end > start:
        return stripped[start : end + 1]
    return stripped


def compile_default_surface() -> TestFitSurface:
    return TestFitSurface(orchestration=Orchestration(client=ClaudeClient()))


def catalog_preview() -> dict:
    raw = json.loads((FURNITURE_DIR / "catalog.json").read_text(encoding="utf-8"))
    return {
        "version": raw.get("version"),
        "count": len(raw.get("items", [])),
        "types": sorted({it.get("type") for it in raw.get("items", [])}),
    }
