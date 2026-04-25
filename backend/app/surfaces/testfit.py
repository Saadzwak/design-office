"""Surface 2 — Test Fit (3 variants in parallel + Reviewer)."""

from __future__ import annotations

import json
import re
import uuid
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from pathlib import Path

from pydantic import BaseModel, Field

from app.agents.orchestrator import (
    Orchestration,
    StructuredSubAgent,
    StructuredSubAgentOutput,
    SubAgent,
    SubAgentOutput,
)
from app.schemas import (
    AdjacencyAuditLLMOutput,
    IterateLLMOutput,
    MicroZoningLLMOutput,
    PartiPrisLLMOutput,
    ReviewerLLMOutput,
    VariantLLMOutput,
)
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

    def _reviewer_agent(self) -> StructuredSubAgent:
        # iter-23 — tool_use guarantees ReviewerLLMOutput shape.
        return StructuredSubAgent(
            name="Reviewer",
            system_prompt=_read(PROMPTS_DIR / "testfit_reviewer.md"),
            user_template=_REVIEWER_USER,
            output_schema=ReviewerLLMOutput.model_json_schema(),
            tool_name="emit_reviewer_verdict",
            tool_description=(
                "Emit the verdict (pmr_ok, erp_ok, programme_coverage_ok, "
                "issues[], verdict). Keep issue bullets short and concrete."
            ),
            max_tokens=2000,
        )

    def _proposer_agent(self) -> StructuredSubAgent:
        return StructuredSubAgent(
            name="PartiPrisProposer",
            system_prompt=_read(PROMPTS_DIR / "testfit_parti_pris_proposer.md"),
            user_template=_PROPOSER_USER,
            output_schema=PartiPrisLLMOutput.model_json_schema(),
            tool_name="emit_partis_pris",
            tool_description=(
                "Emit exactly 3 project-tailored partis pris. Each needs id, "
                "title, one_line, directive, 3-5 signature_moves, trade_off, "
                "and a style_classification (villageois|atelier|hybride_flex)."
            ),
            # 3 partis pris × ~600 tokens each ≈ 2 k. 4 k headroom.
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
            out = self.orchestration.run_structured_subagent(
                agent, ctx, tag="testfit.parti_pris_proposer"
            )
            proposals = out.data.get("partis_pris", [])
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

    def _adjacency_agent(self) -> StructuredSubAgent:
        # iter-23 — tool_use guarantees valid AdjacencyAuditLLMOutput.
        return StructuredSubAgent(
            name="AdjacencyValidator",
            system_prompt=_read(PROMPTS_DIR / "testfit_adjacency_validator.md"),
            user_template=_ADJACENCY_USER,
            output_schema=AdjacencyAuditLLMOutput.model_json_schema(),
            tool_name="emit_adjacency_audit",
            tool_description=(
                "Emit the adjacency audit (score 0-100, summary, up to 10 "
                "violations, up to 3 recommendations). Each violation MUST "
                "cite a rule_id verbatim from the adjacency-rules resource."
            ),
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

        # iter-23 (Saad, 2026-04-24) — variant generator uses the tool_use
        # API so Claude's output is guaranteed to match VariantLLMOutput's
        # JSON schema. No more parse errors, no more defensive repair.
        system = _read(PROMPTS_DIR / "testfit_variant.md")
        variant_schema = VariantLLMOutput.model_json_schema()
        agents = [
            (
                style,
                StructuredSubAgent(
                    name=style.value,
                    system_prompt=system,
                    user_template=_VARIANT_USER,
                    output_schema=variant_schema,
                    tool_name="emit_variant",
                    tool_description=(
                        "Emit the full variant plan (style, title, 3-5 para "
                        "narrative, zones array, metrics). Every zone must "
                        "have a valid kind + the fields listed for that kind. "
                        "Do NOT emit prose outside this tool call."
                    ),
                    # iter-23 — with tool_use the output is a structured
                    # dict, much more compact than freeform JSON-in-text.
                    # 16 k is enough for 40 rooms + zones + narrative ;
                    # the Anthropic SDK now forces streaming above this
                    # threshold, which we don't implement yet.
                    max_tokens=16000,
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

        # iter-23 — structured variant runner. Returns a dict already
        # validated against VariantLLMOutput's JSON schema by the API,
        # so there's no parse step. If Claude refuses the tool call
        # (exceedingly rare with tool_choice forced) we fall back to
        # an empty variant so the rest of the pipeline still renders.
        def _run(
            agent: StructuredSubAgent, style: VariantStyle
        ) -> tuple[VariantStyle, StructuredSubAgentOutput | None, Exception | None]:
            ctx = dict(base_context)
            ctx["style_value"] = style.value
            ctx["parti_pris_directive"] = partis_pris_by_style.get(
                style, _fallback_parti_pris_directive(style)
            )
            try:
                out = self.orchestration.run_structured_subagent(
                    agent, ctx, tag="testfit.variant"
                )
                return style, out, None
            except Exception as exc:  # noqa: BLE001
                return style, None, exc

        with ThreadPoolExecutor(max_workers=len(agents)) as pool:
            futures = [pool.submit(_run, a, s) for s, a in agents]
            results = [f.result() for f in futures]

        # iter-24 P1 (Saad, 2026-04-24) — shared run_id so every
        # variant screenshot file goes into sketchup_shots with a
        # unique, sortable name : macro_<run_id>_<style>.png.
        # This replaces the old `facade.screenshot(view_name="iso")`
        # call which was missing `out_path=` entirely — SketchUp
        # MCP only persists a PNG to disk when path= is given, so
        # the old macro pipeline never wrote anything and the
        # frontend had no live render to display.
        SKETCHUP_SHOTS_DIR.mkdir(parents=True, exist_ok=True)
        run_id = uuid.uuid4().hex[:12]

        # Replay each variant on the SketchUp (mock) backend and build
        # the VariantOutput. With tool_use there's no parse error path
        # — only the rare API-level failure, which yields an empty
        # fallback variant.
        for style, structured_out, err in results:
            if structured_out is None:
                variant_obj = {
                    "style": style.value,
                    "title": f"{style.value} — API error",
                    "narrative": f"Structured variant call failed : {err}.",
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
                        "notes": ["structured_api_error"],
                    },
                }
            else:
                total_in += structured_out.input_tokens
                total_out += structured_out.output_tokens
                variant_obj = structured_out.data

            facade = SketchUpFacade(backend=get_backend())
            facade.new_scene(name=f"{client_name} — {style.value}")
            # iter-21d (Phase B) — drop the source PDF as a reference
            # layer underneath the variant geometry, so architects see
            # the real plan and the generated zones as a single scene.
            # No-op on the mock backend (returns ok=True, mock=True).
            _import_reference_image_if_available(facade, floor_plan)
            _replay_floor_plan(facade, floor_plan)
            _replay_zones(facade, variant_obj.get("zones", []))

            # iter-24 P1 — capture a fresh iso PNG on disk and expose
            # its URL. On the mock backend `screenshot` returns a
            # made-up path and no file is written ; we detect that
            # via `shot_path.exists()` and leave `sketchup_shot_url`
            # as None so the frontend knows to fall back.
            shot_filename = f"macro_{run_id}_{style.value}.png"
            shot_path = SKETCHUP_SHOTS_DIR / shot_filename
            try:
                facade.screenshot(view_name="iso", out_path=str(shot_path))
            except Exception as exc:  # noqa: BLE001
                # SketchUp may be down ; graceful degradation, but we
                # log the failure so an architect can tell the pipeline
                # ran without a render vs a real SketchUp crash.
                print(
                    f"[testfit.generate] screenshot failed for {style.value}: "
                    f"{type(exc).__name__}: {exc}",
                    flush=True,
                )
            sketchup_shot_url: str | None = None
            screenshot_paths: list[str] = []
            if shot_path.exists() and shot_path.stat().st_size > 1024:
                sketchup_shot_url = f"/api/testfit/screenshot/{shot_filename}"
                screenshot_paths = [str(shot_path)]

            # iter-24 P4 — capture 6 pseudo-3D angles so the frontend's
            # PseudoThreeDViewer has a dock to orbit. Sync capture : at
            # ~1s per angle on a small plate this adds ~6s per variant
            # (~18s per macro run) — well within the overall LLM budget.
            # Uses a variant_id suffixed with the run_id so reruns don't
            # overwrite each other's angle PNGs.
            multi_variant_id = f"macro_{run_id}_{style.value}"
            sketchup_shot_urls: dict[str, str] = {}
            try:
                multi = facade.capture_multi_angle_renders(
                    variant_id=multi_variant_id,
                    out_dir=str(SKETCHUP_SHOTS_DIR),
                )
                for angle, abs_path in (multi.get("paths") or {}).items():
                    fname = Path(abs_path).name
                    sketchup_shot_urls[angle] = f"/api/testfit/screenshot/{fname}"
            except Exception as exc:  # noqa: BLE001
                print(
                    f"[testfit.generate] multi-angle capture failed for "
                    f"{style.value}: {type(exc).__name__}: {exc}",
                    flush=True,
                )

            # iter-26 P2 — axis-aligned bbox collision detection across
            # the LLM-emitted zones. Detection only ; we surface warnings
            # the architect can either accept or fix via iterate. Source
            # is variant_obj["zones"] (raw LLM output) ; using the trace
            # would conflate hero / human / phone-booth decor with the
            # area zones we actually want to validate.
            from app.agents.zone_overlap_validator import detect_overlaps

            geometric_overlaps = detect_overlaps(variant_obj.get("zones") or [])

            metrics = VariantMetrics(**variant_obj.get("metrics", {}))
            variants.append(
                VariantOutput(
                    style=style,
                    title=variant_obj.get("title", style.value),
                    narrative=variant_obj.get("narrative", ""),
                    metrics=metrics,
                    sketchup_trace=facade.trace(),
                    screenshot_paths=screenshot_paths,
                    sketchup_shot_url=sketchup_shot_url,
                    sketchup_shot_urls=sketchup_shot_urls,
                    geometric_overlaps=list(geometric_overlaps),
                )
            )

        # 3. Reviewer + Adjacency Validator — two calls per variant, all in
        #    parallel. 3 variants × 2 reviewers = up to 6 threads ; the
        #    orchestrator serialises network I/O so this stays safe.
        reviewer = self._reviewer_agent()
        adjacency = self._adjacency_agent()

        # iter-23 — reviewer + adjacency through tool_use. Returns a
        # dict validated by Anthropic against the schema ; the try/except
        # only catches API-level failures (rare, given tool_choice forces
        # the tool call).
        def _review(
            style: VariantStyle, variant_json: str
        ) -> tuple[VariantStyle, StructuredSubAgentOutput | None, Exception | None]:
            ctx = dict(base_context)
            ctx["variant_json"] = variant_json
            ctx["style_value"] = style.value
            try:
                out = self.orchestration.run_structured_subagent(
                    reviewer, ctx, tag="testfit.reviewer"
                )
                return style, out, None
            except Exception as exc:  # noqa: BLE001
                return style, None, exc

        def _adjacency(
            style: VariantStyle, variant_json: str
        ) -> tuple[VariantStyle, StructuredSubAgentOutput | None, Exception | None]:
            ctx = dict(base_context)
            ctx["variant_json"] = variant_json
            ctx["style_value"] = style.value
            try:
                out = self.orchestration.run_structured_subagent(
                    adjacency, ctx, tag="testfit.adjacency"
                )
                return style, out, None
            except Exception as exc:  # noqa: BLE001
                return style, None, exc

        pairs = [(v.style, _variant_to_json(v)) for v in variants]
        with ThreadPoolExecutor(max_workers=max(1, len(pairs) * 2)) as pool:
            rev_futures = [pool.submit(_review, s, j) for s, j in pairs]
            adj_futures = [pool.submit(_adjacency, s, j) for s, j in pairs]
            reviewer_results = [f.result() for f in rev_futures]
            adjacency_results = [f.result() for f in adj_futures]

        for style, rev_out, rev_err in reviewer_results:
            if rev_out is None:
                verdicts.append(
                    ReviewerVerdict(
                        style=style,
                        pmr_ok=False,
                        erp_ok=False,
                        programme_coverage_ok=False,
                        issues=[f"reviewer_api_error: {rev_err}"],
                        verdict="rejected",
                    )
                )
                continue
            total_in += rev_out.input_tokens
            total_out += rev_out.output_tokens
            try:
                verdicts.append(ReviewerVerdict(**rev_out.data))
            except Exception as exc:  # noqa: BLE001
                # Shape-drift defence : schema said one thing, Claude
                # sent another. Log + carry on with a minimal verdict.
                verdicts.append(
                    ReviewerVerdict(
                        style=style,
                        pmr_ok=False,
                        erp_ok=False,
                        programme_coverage_ok=False,
                        issues=[f"reviewer_shape_error: {exc}"],
                        verdict="rejected",
                    )
                )

        # Adjacency audit — attach onto the matching VariantOutput.
        audits_by_style: dict[VariantStyle, AdjacencyAudit] = {}
        for style, adj_out, adj_err in adjacency_results:
            if adj_out is None:
                audits_by_style[style] = AdjacencyAudit(
                    score=0,
                    summary=f"Adjacency API error : {adj_err}",
                    violations=[],
                    recommendations=[],
                )
                continue
            total_in += adj_out.input_tokens
            total_out += adj_out.output_tokens
            try:
                audits_by_style[style] = _coerce_adjacency_audit(adj_out.data)
            except Exception as exc:  # noqa: BLE001
                audits_by_style[style] = AdjacencyAudit(
                    score=0,
                    summary=f"Adjacency shape error : {exc}",
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


def _import_reference_image_if_available(
    facade: SketchUpFacade, plan: FloorPlan
) -> None:
    """Best-effort SketchUp reference-plan import.

    iter-21d (Phase B) introduced this helper to drop the source PDF
    underneath each variant scene as an architectural underlay. iter-26
    P1 (Saad, 2026-04-25) renamed it from `_import_reference_plan_…`
    and switched the wire format from PDF to PNG :

      - SketchUp's `add_image` only decodes raster formats. Feeding it
        a `.pdf` path silently returns nil ; the feature was
        effectively dark for every project that DID have a
        plan_source_id.
      - `save_source_pdf` now renders a sister PNG at the same hash,
        and `resolve_source_png` returns the cached image (with a lazy
        backfill for pre-iter-26 PDFs).
      - The PNG is dropped at the model origin and explicitly resized
        to `real_width_m × real_height_m` (via the Ruby
        `import_plan_pdf` tool which forces both width and height).
        That guarantees zone bboxes overlay the right spot on the
        plan even if the PDF aspect doesn't match the building aspect
        — the architect cares about zone alignment, not perfect
        page reproduction.

    All failure modes (no plan_source_id, PNG missing / corrupted,
    SketchUp down, mock backend) return silently. Never raises.
    """

    from app.pdf.parser import resolve_source_png

    image_path = resolve_source_png(plan.plan_source_id)
    if image_path is None:
        return
    width_m = plan.real_width_m
    height_m = plan.real_height_m
    if not width_m or not height_m or width_m <= 0 or height_m <= 0:
        return
    try:
        facade.import_plan_pdf(
            # Kept the kwarg name for backward compat with the MCP /
            # mock backend wire ; the value is now an absolute PNG path.
            pdf_path=str(image_path),
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


# iter-23 (Saad, 2026-04-24) — `_strip_json`, `_close_unterminated_json`,
# `_truncate_to_last_balanced`, and the 3 regex constants
# (`_TRAILING_COMMA_RE`, `_LINE_COMMENT_RE`, `_BLOCK_COMMENT_RE`) were
# DELETED when every JSON-emitting agent (variant generator, reviewer,
# parti-pris proposer, adjacency, iterate, micro-zoning) migrated to
# the `tool_use` API. Anthropic validates the schema server-side ;
# there's no freeform text to parse or repair on the client. See
# `docs/TOOL_USE_MIGRATION.md` for the pivot rationale.


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

    # iter-23 — iterate uses the same VariantLLMOutput schema as the
    # variant generator (iterate emits a fresh variant).
    agent = StructuredSubAgent(
        name="Iterate",
        system_prompt=_read(PROMPTS_DIR / "testfit_iterate.md"),
        user_template=_ITERATE_USER,
        output_schema=IterateLLMOutput.model_json_schema(),
        tool_name="emit_iterated_variant",
        tool_description=(
            "Emit the updated variant plan reflecting the user's "
            "instruction. Keep style unchanged, update zones / metrics / "
            "narrative as the instruction implies."
        ),
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

    try:
        sub = orch.run_structured_subagent(agent, context, tag="testfit.iterate")
    except Exception as exc:  # noqa: BLE001
        raise ValueError(
            f"Iteration agent API error: {exc}"
        ) from exc
    payload = sub.data

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
    _import_reference_image_if_available(facade, request.floor_plan)
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
            # iter-24 P1 — same URL field the macro /generate populates,
            # so VariantCard can read one channel regardless of which
            # endpoint produced the variant.
            "sketchup_shot_url": screenshot_url,
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

    # iter-23 — tool_use-based micro-zoning. Schema forces a zones
    # array with the agreed shape ; no more text-parse failures.
    agent = StructuredSubAgent(
        name="MicroZoningStructured",
        system_prompt=_read(PROMPTS_DIR / "testfit_micro_zoning_structured.md"),
        user_template=_MICRO_ZONING_USER,
        output_schema=MicroZoningLLMOutput.model_json_schema(),
        tool_name="emit_micro_zoning",
        tool_description=(
            "Emit the micro-zoning drill-down. Provide 3 to 30 zones, each "
            "with surface, status (keep|merge|repurpose|new), furniture, "
            "materials, acoustic and adjacency. Honour the variant's "
            "partis-pris and the existing rooms you chose to keep."
        ),
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
    try:
        sub = orch.run_structured_subagent(
            agent, context, tag="testfit.micro_zoning_structured"
        )
    except Exception as exc:  # noqa: BLE001
        return StructuredMicroZoningResponse(
            variant_style=request.variant.style,
            zones=[],
            markdown=f"Structured micro-zoning API error : {exc}",
            tokens={"input": 0, "output": 0},
            duration_ms=0,
        )
    payload = sub.data

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
