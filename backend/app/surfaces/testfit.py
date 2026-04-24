"""Surface 2 — Test Fit (3 variants in parallel + Reviewer)."""

from __future__ import annotations

import json
import re
import uuid
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from pathlib import Path

from pydantic import BaseModel, Field

from app.agents.orchestrator import Orchestration, SubAgent, SubAgentOutput
from app.claude_client import ClaudeClient
from app.mcp.sketchup_client import SketchUpFacade, get_backend
from app.models import (
    AcousticTarget,
    AdjacencyAudit,
    AdjacencyViolation,
    FloorPlan,
    ReviewerVerdict,
    StructuredAdjacencyCheck,
    StructuredFurniturePiece,
    StructuredMaterial,
    StructuredMicroZoningResponse,
    StructuredZone,
    TestFitResponse,
    VariantMetrics,
    VariantOutput,
    VariantStyle,
    ZONE_ICON_ALIASES,
)

BACKEND_ROOT = Path(__file__).resolve().parent.parent
PROMPTS_DIR = BACKEND_ROOT / "prompts" / "agents"
RESOURCES_DIR = BACKEND_ROOT / "data" / "resources"
BENCHMARKS_DIR = BACKEND_ROOT / "data" / "benchmarks"
FURNITURE_DIR = BACKEND_ROOT / "data" / "furniture"
SKETCHUP_SHOTS_DIR = BACKEND_ROOT / "out" / "sketchup_shots"

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

# iter-17 B : adjacency validator is a 4th Level-2 agent that runs in
# parallel with the Reviewer. It sees ONLY the adjacency-rules
# catalogue + the variant ; the Reviewer keeps covering PMR / ERP.
ADJACENCY_RESOURCES = [
    "adjacency-rules.md",
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
    # iter-21a (Saad, 2026-04-24) : project specificity was leaking out of
    # the Test Fit pipeline because the raw brief + industry were never
    # sent to the variant generator — only the distilled programme. With
    # these two fields in the request, the new Parti Pris Proposer stage
    # can tailor the 3 partis pris to THIS project (use case, vocabulary,
    # building typology) instead of the hardcoded Villageois / Atelier /
    # Hybride Flex archetypes.
    brief: str = Field(
        default="",
        description=(
            "The raw client brief (free-text). When supplied, the Parti "
            "Pris Proposer uses it to tailor the 3 partis pris to this "
            "project's use case and vocabulary. Empty string falls back "
            "to the hardcoded tertiary-office archetypes."
        ),
    )
    client_industry: str = Field(
        default="",
        description=(
            "Client industry tag (tech_startup, law_firm, creative_agency, "
            "bank_insurance, consulting, healthcare, public_sector, other). "
            "Steers the Proposer away from generic bureau moulds."
        ),
    )
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


_VARIANT_USER = """Client : {client_name}
Industry : {client_industry}
Style classification (for SketchUp routing, NOT for client narrative) : {style_value}

Client brief (the source of truth — use its vocabulary, reference its
constraints directly in your title + narrative) :

<brief>
{brief}
</brief>

Parti pris directive for THIS slot — tailored to this project by the
Parti Pris Proposer (follow it ; your title must echo its title) :

<parti_pris_directive>
{parti_pris_directive}
</parti_pris_directive>

Consolidated programme (respect quantities ± 5 %) :

<programme>
{programme_markdown}
</programme>

Existing interior partitioning — ROOMS the plate already has (before
your intervention). For each one you MUST decide KEEP / MERGE /
REPURPOSE. If empty, the plate is bare :

<existing_rooms>
{existing_rooms}
</existing_rooms>

Existing interior WALLS + OPENINGS — these are the cloisons separating
the rooms above. Wall indices are 0-based. Cite them in the narrative
when you MERGE (open a wall) :

<existing_walls>
{existing_walls}
</existing_walls>

Floor plan (mm, origin bottom-left, envelope + cores + columns + windows +
rooms + walls) :

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


_PROPOSER_USER = """Client : {client_name}
Industry : {client_industry}

Raw brief :

<brief>
{brief}
</brief>

Consolidated programme :

<programme>
{programme_markdown}
</programme>

Floor plan envelope (for physical plausibility — plate shape, depth,
column grid, cores, facade orientation) :

<floor_plan_json>
{floor_plan_json}
</floor_plan_json>

Furniture catalogue (for procurement hints) :

<catalog_json>
{catalog_json}
</catalog_json>

Propose exactly 3 partis pris per your system instructions. Return
only the JSON."""


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


_ADJACENCY_USER = """Floor plan :

<floor_plan_json>
{floor_plan_json}
</floor_plan_json>

Variant under review :

<variant_json>
{variant_json}
</variant_json>

Adjacency-rules catalogue (cite `rule_id` verbatim in your audit) :

<resources_excerpts>
{adjacency_resources}
</resources_excerpts>

Return the adjacency audit JSON per your system instructions. Return only the JSON."""


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
                # iter-22c (Saad, 2026-04-24) : bumped to 32 k (Opus 4.7
                # ceiling). On the real Lovable plan with 40+ rooms +
                # hero entities + long narrative, 16 k was hitting the
                # cap mid-string and emitting unterminated JSON. 32k
                # gives Opus room to close every string cleanly.
                max_tokens=32000,
            )
            for style in VariantStyle
        ]

    def _reviewer_agent(self) -> SubAgent:
        return SubAgent(
            name="Reviewer",
            system_prompt=_read(PROMPTS_DIR / "testfit_reviewer.md"),
            user_template=_REVIEWER_USER,
            max_tokens=2000,
        )

    def _proposer_agent(self) -> SubAgent:
        return SubAgent(
            name="PartiPrisProposer",
            system_prompt=_read(PROMPTS_DIR / "testfit_parti_pris_proposer.md"),
            user_template=_PROPOSER_USER,
            # 3 partis pris × ~600 tokens each + JSON overhead ≈ 2.5 k.
            # Give 4 k to be safe on a chatty Opus.
            max_tokens=4000,
        )

    def _propose_partis_pris(
        self,
        base_context: dict[str, str],
        styles: list[VariantStyle],
    ) -> dict[VariantStyle, str]:
        """Run the Parti Pris Proposer and return a `{style: directive}`
        map ready to splice into each variant generator's context.

        iter-21a (Saad, 2026-04-24) : this is the fix for the "the 3
        variants feel random, they don't reflect the project" bug. The
        proposer sees the brief + industry + programme + envelope and
        proposes 3 project-tailored partis pris. If it fails for any
        reason — parse error, empty brief, API glitch — we log a note
        and fall back to the hardcoded archetypes so the surface never
        blocks on this new stage.
        """

        if not base_context.get("brief") or base_context["brief"].startswith(
            "(no raw brief"
        ):
            # Without a brief the proposer has nothing project-specific
            # to anchor on. Fall back cleanly to the legacy archetypes.
            return {s: _fallback_parti_pris_directive(s) for s in styles}

        try:
            agent = self._proposer_agent()
            ctx = dict(base_context)
            ctx.pop("parti_pris_directive", None)
            out = self.orchestration.run_subagent(
                agent, ctx, tag="testfit.parti_pris_proposer"
            )
            payload = json.loads(_strip_json(out.text), strict=False)
            proposals = payload.get("partis_pris", [])
            if not isinstance(proposals, list) or len(proposals) == 0:
                return {s: _fallback_parti_pris_directive(s) for s in styles}

            # Map each proposal to a style slot. Prefer the proposal's
            # own `style_classification` when it matches a requested
            # style ; otherwise assign in order (first proposal → first
            # style) so every requested slot has a directive.
            by_style: dict[VariantStyle, str] = {}
            leftovers: list[dict] = []
            for p in proposals:
                if not isinstance(p, dict):
                    continue
                raw_cls = str(p.get("style_classification", "")).lower().strip()
                target: VariantStyle | None = None
                for s in styles:
                    if s.value == raw_cls and s not in by_style:
                        target = s
                        break
                if target is not None:
                    by_style[target] = _parti_pris_to_directive_text(p)
                else:
                    leftovers.append(p)

            # Assign any leftovers to any still-empty style slots.
            for s in styles:
                if s in by_style:
                    continue
                if leftovers:
                    by_style[s] = _parti_pris_to_directive_text(leftovers.pop(0))
                else:
                    by_style[s] = _fallback_parti_pris_directive(s)
            return by_style
        except Exception:  # noqa: BLE001
            # Any failure — parse error, network, JSON schema — falls
            # back silently. The surface keeps working ; we lose the
            # tailoring, not the whole Test Fit.
            return {s: _fallback_parti_pris_directive(s) for s in styles}

    def _adjacency_agent(self) -> SubAgent:
        return SubAgent(
            name="AdjacencyValidator",
            system_prompt=_read(PROMPTS_DIR / "testfit_adjacency_validator.md"),
            user_template=_ADJACENCY_USER,
            # iter-21c — bumped from 2000 to 4000. The Phase A floor
            # plan carries up to 42 rooms + 31 walls, so the validator
            # surface-area grew ; its output is sometimes 6-8 violations
            # with long descriptions. 2000 was cutting off structured
            # JSON mid-stream and triggering parse errors across all 3
            # variants on the Lovable plan.
            max_tokens=4000,
        )

    def generate(
        self,
        floor_plan: FloorPlan,
        programme_markdown: str,
        client_name: str,
        styles: list[VariantStyle],
        brief: str = "",
        client_industry: str = "",
    ) -> TestFitResponse:
        catalog_json = (FURNITURE_DIR / "catalog.json").read_text(encoding="utf-8")
        ratios_json = (BENCHMARKS_DIR / "ratios.json").read_text(encoding="utf-8")
        variant_resources = _load_resources(VARIANT_RESOURCES)
        reviewer_resources = _load_resources(REVIEWER_RESOURCES)
        adjacency_resources = _load_resources(ADJACENCY_RESOURCES)
        floor_plan_json = floor_plan.model_dump_json()

        system = _read(PROMPTS_DIR / "testfit_variant.md")
        agents = [
            (
                style,
                SubAgent(
                    name=style.value,
                    system_prompt=system,
                    user_template=_VARIANT_USER,
                    # iter-22c — 32 k to avoid mid-string truncation
                    # on big Lovable-scale variants (40+ rooms + heroes).
                    max_tokens=32000,
                ),
            )
            for style in styles
        ]

        base_context = {
            "client_name": client_name,
            "client_industry": client_industry or "unspecified",
            "brief": brief or "(no raw brief supplied — rely on the programme)",
            "programme_markdown": programme_markdown,
            "floor_plan_json": floor_plan_json,
            "catalog_json": catalog_json,
            "ratios_json": ratios_json,
            "variant_resources": variant_resources,
            "reviewer_resources": reviewer_resources,
            "adjacency_resources": adjacency_resources,
            "variant_json": "",
            # Placeholder — populated per-slot after the proposer runs.
            "parti_pris_directive": "",
            # iter-21b : existing partitioning summary — fed to the
            # variant generator so it can reason KEEP / MERGE /
            # REPURPOSE per room instead of laying zones at random on a
            # blank box. Empty string when the plate is bare (Vision
            # saw no interior rooms), in which case the prompt falls
            # back to the legacy "free placement" flow.
            "existing_rooms": _summarise_existing_rooms(floor_plan),
            "existing_walls": _summarise_existing_walls(floor_plan),
        }

        total_in = 0
        total_out = 0
        variants: list[VariantOutput] = []
        verdicts: list[ReviewerVerdict] = []

        # iter-21a : the Parti Pris Proposer runs BEFORE the variant
        # generators. It reads brief + industry + programme + floor plan
        # and returns 3 project-tailored partis pris, each with a
        # directive and a `style_classification` that routes it to one
        # of the three variant generators. Falls back to the hardcoded
        # style directives if the proposer fails — the surface keeps
        # producing variants even if this extra agent hiccups.
        partis_pris_by_style = self._propose_partis_pris(base_context, styles)

        # 1. Run variant generators in parallel.
        def _run(agent: SubAgent, style: VariantStyle) -> tuple[VariantStyle, SubAgentOutput]:
            ctx = dict(base_context)
            ctx["style_value"] = style.value
            ctx["parti_pris_directive"] = partis_pris_by_style.get(
                style, _fallback_parti_pris_directive(style)
            )
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
                # iter-22b — strict=False so raw newlines / tabs in
                # narrative strings don't break parsing. Opus emits
                # multi-paragraph narratives literally.
                variant_obj = json.loads(variant_json, strict=False)
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
            # iter-21d (Phase B) — drop the source PDF as a reference
            # layer underneath the variant geometry, so architects see
            # the real plan and the generated zones as a single scene.
            # No-op on the mock backend (returns ok=True, mock=True).
            _import_reference_plan_if_available(facade, floor_plan)
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

        # 3. Reviewer + Adjacency Validator — two calls per variant, all in
        #    parallel. 3 variants × 2 reviewers = up to 6 threads ; the
        #    orchestrator serialises network I/O so this stays safe.
        reviewer = self._reviewer_agent()
        adjacency = self._adjacency_agent()

        def _review(style: VariantStyle, variant_json: str) -> tuple[VariantStyle, SubAgentOutput]:
            ctx = dict(base_context)
            ctx["variant_json"] = variant_json
            ctx["style_value"] = style.value
            return style, self.orchestration.run_subagent(
                reviewer, ctx, tag="testfit.reviewer"
            )

        def _adjacency(style: VariantStyle, variant_json: str) -> tuple[VariantStyle, SubAgentOutput]:
            ctx = dict(base_context)
            ctx["variant_json"] = variant_json
            ctx["style_value"] = style.value
            return style, self.orchestration.run_subagent(
                adjacency, ctx, tag="testfit.adjacency"
            )

        pairs = [(v.style, _variant_to_json(v)) for v in variants]
        with ThreadPoolExecutor(max_workers=max(1, len(pairs) * 2)) as pool:
            rev_futures = [pool.submit(_review, s, j) for s, j in pairs]
            adj_futures = [pool.submit(_adjacency, s, j) for s, j in pairs]
            reviewer_results = [f.result() for f in rev_futures]
            adjacency_results = [f.result() for f in adj_futures]

        for style, out in reviewer_results:
            total_in += out.input_tokens
            total_out += out.output_tokens
            try:
                payload = json.loads(_strip_json(out.text), strict=False)
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

        # 4. Adjacency audit — attach onto the matching VariantOutput.
        audits_by_style: dict[VariantStyle, AdjacencyAudit] = {}
        for style, out in adjacency_results:
            total_in += out.input_tokens
            total_out += out.output_tokens
            try:
                payload = json.loads(_strip_json(out.text), strict=False)
                audits_by_style[style] = _coerce_adjacency_audit(payload)
            except Exception as exc:  # noqa: BLE001
                audits_by_style[style] = AdjacencyAudit(
                    score=0,
                    summary=f"Adjacency audit parse error : {exc}",
                    violations=[],
                    recommendations=[],
                )

        variants = [
            v.model_copy(update={"adjacency_audit": audits_by_style.get(v.style)})
            for v in variants
        ]

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


def _coerce_adjacency_audit(payload: dict) -> AdjacencyAudit:
    """Accept the LLM JSON and clean it up defensively so a minor schema
    drift (stringy score, missing fields, extra keys) never crashes the
    pipeline. Honours the rule-catalogue §9 caps (≤10 violations, ≤3
    recommendations) as a final safety net.
    """

    score_raw = payload.get("score", 100)
    try:
        score = int(score_raw)
    except (TypeError, ValueError):
        score = 0
    score = max(0, min(100, score))

    violations_raw = payload.get("violations") or []
    if not isinstance(violations_raw, list):
        violations_raw = []
    violations: list[AdjacencyViolation] = []
    for v in violations_raw[:10]:
        if not isinstance(v, dict):
            continue
        try:
            violations.append(
                AdjacencyViolation(
                    rule_id=str(v.get("rule_id", "unknown")),
                    severity=str(v.get("severity", "minor")).lower()
                    if str(v.get("severity", "minor")).lower()
                    in {"info", "minor", "major", "critical"}
                    else "minor",  # type: ignore[arg-type]
                    zones=[str(z) for z in (v.get("zones") or []) if z],
                    description=str(v.get("description", "")).strip(),
                    suggestion=str(v.get("suggestion", "")).strip(),
                    source=str(v.get("source", "")).strip(),
                )
            )
        except Exception:  # noqa: BLE001
            continue

    recos_raw = payload.get("recommendations") or []
    recommendations = [
        str(r).strip() for r in recos_raw[:3] if isinstance(r, (str, int, float))
    ]
    recommendations = [r for r in recommendations if r]

    return AdjacencyAudit(
        score=score,
        summary=str(payload.get("summary", "")).strip(),
        violations=violations,
        recommendations=recommendations,
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


def _import_reference_plan_if_available(
    facade: SketchUpFacade, plan: FloorPlan
) -> None:
    """Best-effort SketchUp reference-plan import.

    iter-21d (Phase B) : if the FloorPlan carries a `plan_source_id`
    AND Vision inferred real envelope dimensions, we ask the MCP facade
    to drop the source PDF as a reference image underneath the variant
    scene. Any failure (PDF expired from disk, SketchUp not live,
    mock backend) returns silently — the variant still renders, just
    without the underlay. Never raises.
    """

    from app.pdf.parser import resolve_source_pdf

    pdf_path = resolve_source_pdf(plan.plan_source_id)
    if pdf_path is None:
        return
    width_m = plan.real_width_m
    height_m = plan.real_height_m
    if not width_m or not height_m or width_m <= 0 or height_m <= 0:
        return
    try:
        facade.import_plan_pdf(
            pdf_path=str(pdf_path),
            width_m=float(width_m),
            height_m=float(height_m),
        )
    except Exception:  # noqa: BLE001
        # Never crash a variant because the reference layer failed.
        return


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
        # iter-22b (Saad, 2026-04-24) — hero entities for visual scale.
        # Opus emits these in the sketchup_trace so variants get real
        # human figures, plants, hero chairs / tables in the 3D iso.
        elif kind == "place_human":
            facade.place_human(
                position_mm=tuple(z.get("position_mm", [0, 0])),
                pose=str(z.get("pose", "standing")),
                orientation_deg=float(z.get("orientation_deg", 0.0)),
                color_rgb=z.get("color_rgb"),
            )
        elif kind == "place_plant":
            facade.place_plant(
                position_mm=tuple(z.get("position_mm", [0, 0])),
                species=str(z.get("species", "ficus_lyrata")),
                orientation_deg=float(z.get("orientation_deg", 0.0)),
                color_rgb=z.get("color_rgb"),
            )
        elif kind == "place_hero":
            facade.place_hero(
                slug=str(z.get("slug", "")),
                position_mm=tuple(z.get("position_mm", [0, 0])),
                orientation_deg=float(z.get("orientation_deg", 0.0)),
                color_rgb=z.get("color_rgb"),
            )
        elif kind == "apply_variant_palette":
            facade.apply_variant_palette(
                walls=z.get("walls"),
                floor=z.get("floor"),
                accent=z.get("accent"),
            )


_TRAILING_COMMA_RE = re.compile(r",(\s*[\]}])")
_LINE_COMMENT_RE = re.compile(r"//[^\n]*")
_BLOCK_COMMENT_RE = re.compile(r"/\*.*?\*/", re.DOTALL)


def _truncate_to_last_balanced(text: str) -> str:
    """Return the longest prefix of `text` that is a balanced JSON
    object. Scans char-by-char keeping a bracket stack ; returns
    the slice ending at the last point where the stack emptied at
    depth 1 (outer object).

    iter-21f — Opus' adjacency output sometimes produces a few
    trailing tokens after the outer `}` that break json.loads
    ("Expecting ',' delimiter"). Cutting at the last balanced `}`
    recovers the intended payload in one shot."""

    depth = 0
    in_string = False
    escape = False
    last_close = -1
    for i, ch in enumerate(text):
        if in_string:
            if escape:
                escape = False
            elif ch == "\\":
                escape = True
            elif ch == '"':
                in_string = False
            continue
        if ch == '"':
            in_string = True
        elif ch == "{" or ch == "[":
            depth += 1
        elif ch == "}" or ch == "]":
            depth -= 1
            if depth == 0:
                last_close = i
    if last_close >= 0:
        return text[: last_close + 1]
    return text


def _close_unterminated_json(text: str) -> str:
    """iter-22c : last-resort repair for outputs truncated mid-string
    (Opus hit max_tokens before closing the narrative). Walks the text
    with the same bracket + string stack as `_truncate_to_last_balanced`
    and, if the scan ends mid-string or mid-object, appends the
    minimum characters needed to close everything cleanly :

      - `"` if still inside a string
      - `]` / `}` for each unclosed opening, in the right order

    The recovered output has empty zones / placeholder values past the
    truncation point, but at least the caller gets a valid JSON object
    with whatever fields Opus DID manage to finish (style, title, at
    least a partial narrative). Much better than score=0 parse_error."""

    depth_stack: list[str] = []  # tracks '{' / '['
    in_string = False
    escape = False
    for ch in text:
        if in_string:
            if escape:
                escape = False
            elif ch == "\\":
                escape = True
            elif ch == '"':
                in_string = False
            continue
        if ch == '"':
            in_string = True
        elif ch == "{":
            depth_stack.append("{")
        elif ch == "[":
            depth_stack.append("[")
        elif ch == "}" and depth_stack and depth_stack[-1] == "{":
            depth_stack.pop()
        elif ch == "]" and depth_stack and depth_stack[-1] == "[":
            depth_stack.pop()

    if not in_string and not depth_stack:
        return text  # already balanced, no-op

    suffix = ""
    # If stuck in a string, close it (content past truncation is lost).
    if in_string:
        suffix += '"'
    # Close every opening in reverse order. The last thing we were
    # inside is at the top of the stack, so pop from the top.
    while depth_stack:
        opener = depth_stack.pop()
        suffix += "}" if opener == "{" else "]"
    return text + suffix


def _strip_json(text: str) -> str:
    """Extract a parseable JSON object from Opus's raw output.

    iter-21c (Saad, 2026-04-24) : made tolerant to the three LLM
    mistakes that kept breaking the adjacency validator on the
    Lovable plan — trailing commas before `]` / `}`, inline `// ...`
    comments, block `/* ... */` comments.

    iter-21f : Opus still occasionally emitted commentary or a stray
    fragment after the outer `}` (violations=[…], ] — double bracket).
    We now also truncate at the last balanced-close so the outer
    object stays clean even if garbage follows.
    """

    stripped = text.strip()
    if stripped.startswith("```"):
        stripped = stripped.split("```", 2)[1]
        if stripped.startswith("json"):
            stripped = stripped[len("json") :]
    # Take the outermost balanced braces.
    start = stripped.find("{")
    end = stripped.rfind("}")
    if start != -1 and end != -1 and end > start:
        stripped = stripped[start : end + 1]
    # Clean common LLM JSON slip-ups before handing to json.loads.
    # Strip `// comment` and `/* comment */` — not legal JSON but
    # Opus sometimes emits them inside violations[].
    stripped = _BLOCK_COMMENT_RE.sub("", stripped)
    stripped = _LINE_COMMENT_RE.sub("", stripped)
    # Strip trailing commas before `]` or `}`.
    stripped = _TRAILING_COMMA_RE.sub(r"\1", stripped)
    # iter-21f — last line of defence : cut at the last balanced close.
    # iter-22c — BUT if the scan says we never closed (truncated
    # mid-string, ran out of tokens), fall back to
    # `_close_unterminated_json` which appends whatever closers are
    # missing so at least the fields that DID finish are recoverable.
    balanced = _truncate_to_last_balanced(stripped)
    if balanced and balanced.endswith("}"):
        return balanced
    return _close_unterminated_json(stripped)


def _summarise_existing_rooms(plan: FloorPlan) -> str:
    """Render `plan.rooms` as a numbered markdown table the LLM can scan.

    iter-21b : empty → empty string (the variant prompt treats this as
    "bare plate, fall back to free placement"). Populated → a numbered
    list with label / kind / area / bbox so the LLM knows WHICH room
    to KEEP / MERGE / REPURPOSE by index."""

    rooms = plan.rooms or []
    if not rooms:
        return "(no existing rooms detected — bare plate)"
    lines: list[str] = []
    lines.append("idx | label | kind | area_m2 | bbox_mm (x0,y0,x1,y1)")
    lines.append("--- | ----- | ---- | ------- | ---------------------")
    for i, r in enumerate(rooms):
        label = r.label or "(unlabeled)"
        area = f"{r.area_m2:.1f}" if r.area_m2 else "?"
        x0, y0, x1, y1 = r.polygon.bbox()
        lines.append(
            f"{i} | {label} | {r.kind} | {area} | "
            f"({x0:.0f},{y0:.0f},{x1:.0f},{y1:.0f})"
        )
    return "\n".join(lines)


def _summarise_existing_walls(plan: FloorPlan) -> str:
    """Render `plan.interior_walls` + `plan.openings` for the LLM.

    Walls are numbered by their 0-based index in `plan.interior_walls`
    so the variant generator can cite them when it MERGEs (opens a
    specific wall).  Openings list which wall they sit in (if Vision
    knew) and their width."""

    walls = plan.interior_walls or []
    openings = plan.openings or []
    if not walls and not openings:
        return "(no interior walls detected)"

    lines: list[str] = []
    if walls:
        lines.append("Interior walls (idx | start_mm | end_mm | thickness_mm | load_bearing) :")
        for i, w in enumerate(walls):
            lb = (
                "yes" if w.is_load_bearing
                else "no" if w.is_load_bearing is False
                else "?"
            )
            lines.append(
                f"- {i} | ({w.start.x:.0f},{w.start.y:.0f}) | "
                f"({w.end.x:.0f},{w.end.y:.0f}) | "
                f"{w.thickness_mm:.0f} | {lb}"
            )
    if openings:
        if lines:
            lines.append("")
        lines.append("Openings (wall_index | center_mm | width_mm | kind) :")
        for o in openings:
            wi = o.wall_index if o.wall_index is not None else "?"
            lines.append(
                f"- {wi} | ({o.center.x:.0f},{o.center.y:.0f}) | "
                f"{o.width_mm:.0f} | {o.kind}"
            )
    return "\n".join(lines)


def _parti_pris_to_directive_text(p: dict) -> str:
    """Render a single parti-pris JSON into the multi-line directive
    string that gets spliced into `_VARIANT_USER` under
    <parti_pris_directive>. iter-21a."""

    title = str(p.get("title", "")).strip()
    one_line = str(p.get("one_line", "")).strip()
    directive = str(p.get("directive", "")).strip()
    moves = p.get("signature_moves", [])
    trade_off = str(p.get("trade_off", "")).strip()

    lines: list[str] = []
    if title:
        lines.append(f"TITLE : {title}")
    if one_line:
        lines.append(f"ONE-LINE : {one_line}")
    if directive:
        lines.append("")
        lines.append("DIRECTIVE :")
        lines.append(directive)
    if isinstance(moves, list) and moves:
        lines.append("")
        lines.append("SIGNATURE MOVES :")
        for m in moves:
            text = str(m).strip()
            if text:
                lines.append(f"- {text}")
    if trade_off:
        lines.append("")
        lines.append(f"TRADE-OFF : {trade_off}")
    return "\n".join(lines).strip() or "(no directive supplied)"


# Legacy archetype directives — kept for the fallback path when the
# Parti Pris Proposer doesn't run (no brief supplied, or its call
# failed). Mirrors the block removed from `testfit_variant.md` so the
# LLM still has SOMETHING actionable in that case.
_FALLBACK_DIRECTIVES: dict[VariantStyle, str] = {
    VariantStyle.VILLAGEOIS: """TITLE : Villageois (fallback archetype)
ONE-LINE : Central collab heart with team neighbourhoods around it.

DIRECTIVE :
Central collab heart (café + town hall + lounge islands forming a
"place"). Team neighbourhoods arranged as quartiers around the heart.
Quiet / focus rings against the quieter façade. Phone booths
distributed at neighbourhood junctions. Identity walls (materials,
colour, artwork) delimiting quartiers.

SIGNATURE MOVES :
- Central collab "place"
- Team quartiers around the heart
- Quiet ring on the calmer façade

TRADE-OFF : Less headline-grabbing concentration than the atelier.""",
    VariantStyle.ATELIER: """TITLE : Atelier (fallback archetype)
ONE-LINE : Workstations hug the luminous façade, meetings move deep inward.

DIRECTIVE :
Workstations hugging the most luminous façade for individual focus.
Meeting rooms consolidated inward (use deeper plan zones). Fewer but
larger collab zones. Library-like atmosphere : lots of absorbent
surfaces, soft light. Biophilic accents inside the collab and break
zones only.

SIGNATURE MOVES :
- Façade-lining desks
- Inner-core meeting rooms
- Library acoustics palette

TRADE-OFF : Collab is less dense than the villageois ; social happens
later, not on the way to your desk.""",
    VariantStyle.HYBRIDE_FLEX: """TITLE : Hybride Flex (fallback archetype)
ONE-LINE : Flex-first, reconfigurable rooms, strong brand wayfinding.

DIRECTIVE :
Flex ratio pushed to 0.65 (from the programme's 0.75 baseline). Mobile
furniture, reconfigurable rooms (USM Haller, Vitra Joyn benches).
Branded wayfinding strong, expression of the client's identity.
Neutral base palette with 1 accent colour per zone. Bookable
everything ; large town hall dominant.

SIGNATURE MOVES :
- Flex ratio 0.65
- Reconfigurable rooms on wheels
- Bookable everything + town hall hero

TRADE-OFF : Individual ownership of a desk is gone ; you gain
reconfigurability, you lose territoriality.""",
}


def _fallback_parti_pris_directive(style: VariantStyle) -> str:
    return _FALLBACK_DIRECTIVES.get(style, f"(no directive for {style.value})")


def compile_default_surface() -> TestFitSurface:
    return TestFitSurface(orchestration=Orchestration(client=ClaudeClient()))


# ---------------------------------------------------------------------------
# Natural-language iteration (CLAUDE.md §13 Phase 3 step 7)
# ---------------------------------------------------------------------------


class IterateRequest(BaseModel):
    instruction: str = Field(..., min_length=3, description="Natural-language modification request.")
    floor_plan: FloorPlan
    variant: VariantOutput
    programme_markdown: str = Field(default="")
    client_name: str = Field(default="Client")


class IterateResponse(BaseModel):
    variant: VariantOutput
    tokens: dict[str, int]
    duration_ms: int
    screenshot_url: str | None = Field(
        default=None,
        description="Fresh SketchUp iso screenshot URL (captured post-replay) if available.",
    )


def sketchup_shot_path_for(filename: str) -> Path | None:
    """Safely resolve a sketchup-shot filename under `SKETCHUP_SHOTS_DIR`.

    Prevents path traversal by rejecting any filename that doesn't match the
    expected pattern. Returns None if the file does not exist or the name is
    rejected.
    """

    import re

    if not re.fullmatch(r"[A-Za-z0-9_\-]+\.png", filename):
        return None
    candidate = SKETCHUP_SHOTS_DIR / filename
    return candidate if candidate.exists() else None


_ITERATE_USER = """Client : {client_name}

<instruction>
{instruction}
</instruction>

<variant>
{variant_json}
</variant>

<floor_plan>
{floor_plan_json}
</floor_plan>

Live SketchUp scene snapshot — what the model currently contains,
read directly from the MCP (empty on mock backends). When non-empty,
this is the authoritative geometry : the `variant_json` above may be
stale after prior iterations. Prefer snapshot coordinates when the
two disagree.

<live_scene_state>
{live_scene_state}
</live_scene_state>

<programme>
{programme_markdown}
</programme>

<catalog_json>
{catalog_json}
</catalog_json>

<ratios_json>
{ratios_json}
</ratios_json>

Return the updated variant JSON per your system instructions."""


def iterate_variant(
    request: IterateRequest,
    orchestration: Orchestration | None = None,
) -> IterateResponse:
    """Apply a natural-language modification to an existing variant.

    Keeps style + title unchanged by default, updates zones / metrics /
    narrative as the user asked. The returned variant is replayed through
    the SketchUp facade so the trace is a fresh record of what the updated
    design would execute.
    """

    orch = orchestration or Orchestration(client=ClaudeClient())
    catalog_json = (FURNITURE_DIR / "catalog.json").read_text(encoding="utf-8")
    ratios_json = (BENCHMARKS_DIR / "ratios.json").read_text(encoding="utf-8")

    agent = SubAgent(
        name="Iterate",
        system_prompt=_read(PROMPTS_DIR / "testfit_iterate.md"),
        user_template=_ITERATE_USER,
        max_tokens=16000,
    )
    # iter-21d (Phase B) — before prompting, read the live SketchUp
    # state via MCP. On the mock backend this returns a stubbed empty
    # payload — the prompt handles that gracefully. When SketchUp is
    # live, the LLM sees what's actually in the model (post-iteration
    # drift is eliminated).
    read_facade = SketchUpFacade(backend=get_backend())
    try:
        live_state_dict = read_facade.read_scene_state()
    except Exception:  # noqa: BLE001
        live_state_dict = {"ok": False, "zones": [], "zone_count": 0}
    live_scene_state = json.dumps(live_state_dict, ensure_ascii=False)

    context = {
        "client_name": request.client_name,
        "instruction": request.instruction,
        "variant_json": json.dumps(
            {
                "style": request.variant.style.value,
                "title": request.variant.title,
                "narrative": request.variant.narrative,
                "zones": _zones_from_trace(request.variant.sketchup_trace),
                "metrics": request.variant.metrics.model_dump(),
            },
            ensure_ascii=False,
        ),
        "floor_plan_json": request.floor_plan.model_dump_json(),
        "live_scene_state": live_scene_state,
        "programme_markdown": request.programme_markdown,
        "catalog_json": catalog_json,
        "ratios_json": ratios_json,
    }

    sub = orch.run_subagent(agent, context, tag="testfit.iterate")
    try:
        payload = json.loads(_strip_json(sub.text))
    except Exception as exc:  # noqa: BLE001
        raise ValueError(
            f"Iteration agent returned malformed JSON: {exc}. Raw: {sub.text[:400]}"
        ) from exc

    metrics = VariantMetrics(
        **payload.get("metrics", request.variant.metrics.model_dump())
    )
    new_variant = VariantOutput(
        style=request.variant.style,
        title=payload.get("title", request.variant.title),
        narrative=payload.get("narrative", request.variant.narrative),
        metrics=metrics,
        sketchup_trace=[],
        screenshot_paths=[],
    )

    facade = SketchUpFacade(backend=get_backend())
    facade.new_scene(name=f"{request.client_name} — {new_variant.style.value} (iter)")
    # iter-21d — re-import the reference PDF on iterate scenes too so
    # the architect's view stays consistent across edits.
    _import_reference_plan_if_available(facade, request.floor_plan)
    _replay_floor_plan(facade, request.floor_plan)
    _replay_zones(facade, payload.get("zones", []))

    # Capture a fresh iso PNG so the frontend can show the post-iterate state
    # instead of the pre-captured baseline. On the RecordingMock backend this
    # is a no-op (no file written) — we fall back to None so the frontend
    # keeps its bundled baseline.
    SKETCHUP_SHOTS_DIR.mkdir(parents=True, exist_ok=True)
    shot_filename = f"{request.variant.style.value}_{uuid.uuid4().hex[:12]}.png"
    shot_path = SKETCHUP_SHOTS_DIR / shot_filename
    try:
        facade.screenshot(view_name="iso", out_path=str(shot_path))
    except Exception:  # noqa: BLE001
        pass  # SketchUp may be down ; fall back to baseline.

    screenshot_url: str | None = None
    if shot_path.exists() and shot_path.stat().st_size > 1024:
        screenshot_url = f"/api/testfit/screenshot/{shot_filename}"

    new_variant = new_variant.model_copy(
        update={
            "sketchup_trace": facade.trace(),
            "screenshot_paths": [str(shot_path)] if screenshot_url else [],
        }
    )

    return IterateResponse(
        variant=new_variant,
        tokens={"input": sub.input_tokens, "output": sub.output_tokens},
        duration_ms=sub.duration_ms,
        screenshot_url=screenshot_url,
    )


# ---------------------------------------------------------------------------
# Micro-zoning — drill into one retained variant, emit per-zone brief
# ---------------------------------------------------------------------------

MICRO_ZONING_RESOURCES = [
    "client-profiles.md",
    "material-finishes.md",
    "acoustic-standards.md",
    "collaboration-spaces.md",
    "biophilic-office.md",
]


class MicroZoningRequest(BaseModel):
    client_name: str = "Client"
    client_industry: str = Field(
        default="tech_startup",
        description=(
            "One of tech_startup, law_firm, bank_insurance, consulting, "
            "creative_agency, healthcare, public_sector, other. Used to bias "
            "furniture + material + acoustic choices."
        ),
    )
    floor_plan: FloorPlan
    variant: VariantOutput
    programme_markdown: str


class MicroZoningResponse(BaseModel):
    markdown: str
    tokens: dict[str, int]
    duration_ms: int


_MICRO_ZONING_USER = """Client:

<client>
{{"name": "{client_name}", "industry": "{client_industry}"}}
</client>

Retained variant:

<retained_variant>
{variant_json}
</retained_variant>

Consolidated programme:

<programme>
{programme_markdown}
</programme>

Floor plan:

<floor_plan>
{floor_plan_json}
</floor_plan>

MCP resources (cite these inline, e.g. `(design://acoustic-standards §2)`):

<resources_excerpts>
{resources}
</resources_excerpts>

Furniture catalogue (pick product_id values from here):

<catalog_json>
{catalog_json}
</catalog_json>

Produce the per-zone micro-zoning brief as specified in your system prompt.
Return Markdown only."""


def run_micro_zoning(
    request: MicroZoningRequest,
    orchestration: Orchestration | None = None,
) -> MicroZoningResponse:
    """Drill into a retained variant and emit a per-zone detail brief."""

    orch = orchestration or Orchestration(client=ClaudeClient())
    catalog_json = (FURNITURE_DIR / "catalog.json").read_text(encoding="utf-8")
    resources = _load_resources(MICRO_ZONING_RESOURCES)

    agent = SubAgent(
        name="MicroZoning",
        system_prompt=_read(PROMPTS_DIR / "testfit_micro_zoning.md"),
        user_template=_MICRO_ZONING_USER,
        max_tokens=6000,
    )
    context = {
        "client_name": request.client_name,
        "client_industry": request.client_industry,
        "variant_json": request.variant.model_dump_json(),
        "programme_markdown": request.programme_markdown,
        "floor_plan_json": request.floor_plan.model_dump_json(),
        "resources": resources,
        "catalog_json": catalog_json,
    }
    sub = orch.run_subagent(agent, context, tag="testfit.micro_zoning")
    return MicroZoningResponse(
        markdown=sub.text.strip(),
        tokens={"input": sub.input_tokens, "output": sub.output_tokens},
        duration_ms=sub.duration_ms,
    )


# ---------------------------------------------------------------------------
# Structured micro-zoning — iter-18i (frontend drill-down consumes typed JSON)
# ---------------------------------------------------------------------------


def run_micro_zoning_structured(
    request: MicroZoningRequest,
    orchestration: Orchestration | None = None,
) -> StructuredMicroZoningResponse:
    """Emit the micro-zoning as typed `{zones[]}` instead of markdown.

    Kept as a sibling of `run_micro_zoning` so iter-17 consumers
    (`selectLatestMicroZoningFor` in the frontend) keep working on the
    markdown path. The structured endpoint powers the iter-18i
    frontend drill-down (zone drawer, numbered plan, etc.).
    """

    orch = orchestration or Orchestration(client=ClaudeClient())
    catalog_json = (FURNITURE_DIR / "catalog.json").read_text(encoding="utf-8")
    resources = _load_resources(MICRO_ZONING_RESOURCES + ["adjacency-rules.md"])

    agent = SubAgent(
        name="MicroZoningStructured",
        system_prompt=_read(PROMPTS_DIR / "testfit_micro_zoning_structured.md"),
        user_template=_MICRO_ZONING_USER,
        # Typed output with 12-14 zones + furniture + materials + acoustic
        # runs ~12-18 k output tokens. Keep headroom.
        max_tokens=16000,
    )
    context = {
        "client_name": request.client_name,
        "client_industry": request.client_industry,
        "variant_json": request.variant.model_dump_json(),
        "programme_markdown": request.programme_markdown,
        "floor_plan_json": request.floor_plan.model_dump_json(),
        "resources": resources,
        "catalog_json": catalog_json,
    }
    sub = orch.run_subagent(agent, context, tag="testfit.micro_zoning_structured")

    try:
        payload = json.loads(_strip_json(sub.text))
        if not isinstance(payload, dict):
            raise ValueError("payload is not an object")
    except Exception as exc:  # noqa: BLE001
        return StructuredMicroZoningResponse(
            variant_style=request.variant.style,
            zones=[],
            markdown=f"Structured micro-zoning parse error : {exc}\nRaw output head :\n{sub.text[:800]}",
            tokens={"input": sub.input_tokens, "output": sub.output_tokens},
            duration_ms=sub.duration_ms,
        )

    zones = _coerce_structured_zones(payload.get("zones"))
    return StructuredMicroZoningResponse(
        variant_style=request.variant.style,
        zones=zones,
        markdown=str(payload.get("markdown", "")).strip(),
        tokens={"input": sub.input_tokens, "output": sub.output_tokens},
        duration_ms=sub.duration_ms,
    )


def _coerce_structured_zones(raw: object) -> list[StructuredZone]:
    """Defensive parser : clean the LLM's JSON before Pydantic strictness
    bites. Handles missing fields, junk icon names, out-of-range statuses,
    stringy surface_m2, and caps the zone count at 14.
    """

    if not isinstance(raw, list):
        return []
    zones: list[StructuredZone] = []
    seen_n: set[int] = set()
    for idx, item in enumerate(raw[:14], start=1):
        if not isinstance(item, dict):
            continue
        try:
            n_raw = item.get("n", idx)
            try:
                n = int(n_raw)
            except (TypeError, ValueError):
                n = idx
            if n in seen_n or n < 1:
                n = idx
            seen_n.add(n)

            surface_raw = item.get("surface_m2", 0)
            try:
                surface = max(0, int(float(surface_raw)))
            except (TypeError, ValueError):
                surface = 0

            icon = str(item.get("icon", "file-text")).strip().lower()
            if icon not in ZONE_ICON_ALIASES:
                icon = "file-text"

            status_raw = str(item.get("status", "ok")).strip().lower()
            status = status_raw if status_raw in {"ok", "warn", "error"} else "ok"

            furniture = _coerce_furniture(item.get("furniture"))
            materials = _coerce_materials(item.get("materials"))
            acoustic = _coerce_acoustic(item.get("acoustic"))
            adjacency = _coerce_structured_adjacency(item.get("adjacency"))

            zones.append(
                StructuredZone(
                    n=n,
                    name=str(item.get("name", f"Zone {n}")).strip() or f"Zone {n}",
                    surface_m2=surface,
                    icon=icon,
                    status=status,  # type: ignore[arg-type]
                    furniture=furniture,
                    materials=materials,
                    acoustic=acoustic,
                    adjacency=adjacency,
                    narrative=str(item.get("narrative", "")).strip(),
                )
            )
        except Exception:  # noqa: BLE001
            continue

    # Re-number contiguously 1..len in case the agent skipped numbers.
    for i, z in enumerate(zones, start=1):
        if z.n != i:
            zones[i - 1] = z.model_copy(update={"n": i})
    return zones


def _coerce_furniture(raw: object) -> list[StructuredFurniturePiece]:
    if not isinstance(raw, list):
        return []
    out: list[StructuredFurniturePiece] = []
    for item in raw[:8]:
        if not isinstance(item, dict):
            continue
        try:
            qty = int(item.get("quantity", 1) or 1)
        except (TypeError, ValueError):
            qty = 1
        name = str(item.get("name", "")).strip()
        if not name:
            continue
        cat_raw = item.get("catalog_id")
        catalog_id = (
            str(cat_raw).strip() if isinstance(cat_raw, str) and cat_raw.strip() else None
        )
        out.append(
            StructuredFurniturePiece(
                brand=str(item.get("brand", "")).strip(),
                name=name,
                quantity=max(1, qty),
                dimensions_mm=str(item.get("dimensions_mm", "")).strip(),
                catalog_id=catalog_id,
            )
        )
    return out


def _coerce_materials(raw: object) -> list[StructuredMaterial]:
    if not isinstance(raw, list):
        return []
    valid_surfaces = {"floor", "walls", "ceiling", "joinery", "textile", "other"}
    out: list[StructuredMaterial] = []
    for item in raw[:6]:
        if not isinstance(item, dict):
            continue
        name = str(item.get("name", "")).strip()
        if not name:
            continue
        surface = str(item.get("surface", "other")).strip().lower()
        if surface not in valid_surfaces:
            surface = "other"
        out.append(
            StructuredMaterial(
                surface=surface,  # type: ignore[arg-type]
                brand=str(item.get("brand", "")).strip(),
                name=name,
                note=str(item.get("note", "")).strip(),
            )
        )
    return out


def _coerce_acoustic(raw: object) -> AcousticTarget | None:
    if not isinstance(raw, dict):
        return None

    def _to_int(v: object) -> int | None:
        try:
            return int(float(v))  # type: ignore[arg-type]
        except (TypeError, ValueError):
            return None

    def _to_float(v: object) -> float | None:
        try:
            return float(v)  # type: ignore[arg-type]
        except (TypeError, ValueError):
            return None

    rw = _to_int(raw.get("rw_target_db"))
    dnt = _to_int(raw.get("dnt_a_target_db") or raw.get("dnt_target_db"))
    tr60 = _to_float(raw.get("tr60_target_s"))
    if rw is None and dnt is None and tr60 is None:
        return None
    return AcousticTarget(
        rw_target_db=rw,
        dnt_a_target_db=dnt,
        tr60_target_s=tr60,
        source=str(raw.get("source", "")).strip(),
    )


def _coerce_structured_adjacency(raw: object) -> StructuredAdjacencyCheck:
    if not isinstance(raw, dict):
        return StructuredAdjacencyCheck()
    ok = bool(raw.get("ok", True))
    note = str(raw.get("note", "")).strip()
    rule_ids_raw = raw.get("rule_ids") or []
    rule_ids = (
        [str(r).strip() for r in rule_ids_raw if isinstance(r, str) and r.strip()]
        if isinstance(rule_ids_raw, list)
        else []
    )
    return StructuredAdjacencyCheck(ok=ok, note=note, rule_ids=rule_ids[:3])


def catalog_preview() -> dict:
    raw = json.loads((FURNITURE_DIR / "catalog.json").read_text(encoding="utf-8"))
    return {
        "version": raw.get("version"),
        "count": len(raw.get("items", [])),
        "types": sorted({it.get("type") for it in raw.get("items", [])}),
    }
