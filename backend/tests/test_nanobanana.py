"""NanoBanana Pro client + visual_moodboard + zone_overlay — iter-17 C.

Tests never hit fal.ai. All network calls are stubbed to assert the
client produces the right request shape, caches correctly, and the
surfaces compose the right prompts from upstream context.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from app.models import FloorPlan, VariantOutput, VariantStyle
from app.services.nanobanana_client import (
    GeneratedImage,
    NanoBananaClient,
    NanoBananaError,
)
from app.surfaces.visual_moodboard import (
    INDUSTRY_REGISTER,
    VARIANT_ATMOSPHERE,
    VisualMoodBoardRequest,
    VisualMoodBoardSurface,
    compose_prompt,
)
from app.surfaces.zone_overlay import (
    ZoneOverlayRequest,
    ZoneOverlaySurface,
)


FIXTURE = (
    Path(__file__).resolve().parent / "fixtures" / "generate_output_sample.json"
)


def _load_sample_variant() -> tuple[FloorPlan, VariantOutput]:
    data = json.loads(FIXTURE.read_text(encoding="utf-8"))
    from app.models import TestFitResponse

    sample = TestFitResponse.model_validate(data)
    return sample.floor_plan, sample.variants[0]


# --------------------------------------------------------------------- client


def test_client_refuses_to_start_without_fal_key(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    monkeypatch.delenv("FAL_KEY", raising=False)
    # Demo fallback bypasses the FAL_KEY requirement; for this test we
    # want the strict path, so explicitly disable it.
    monkeypatch.delenv("MOODBOARD_DEMO_FALLBACK", raising=False)
    with pytest.raises(NanoBananaError):
        NanoBananaClient(cache_dir=tmp_path, api_key=None, demo_fallback=False)


def test_client_cache_hit_bypasses_network(tmp_path: Path) -> None:
    """Placing a pre-existing cache file with the right hash short-
    circuits the fal.ai call. We build the client and compute the
    expected cache key ourselves."""

    client = NanoBananaClient(api_key="fake:key", cache_dir=tmp_path)
    body = {
        "prompt": "hello world",
        "aspect_ratio": "3:2",
        "num_images": 1,
        "output_format": "png",
    }
    key = client._cache_key(
        model=client.text_to_image_model,
        body=body,
        base_image_hash=None,
    )
    (tmp_path / f"{key}.png").write_bytes(b"not a real png but close enough")

    # _submit_and_poll should never be called — install a booby trap.
    def _explode(*args, **kwargs):  # noqa: ANN001
        raise AssertionError("should have returned from cache")

    client._submit_and_poll = _explode  # type: ignore[method-assign]
    result = client.text_to_image(
        prompt="hello world",
        aspect_ratio="3:2",
        num_images=1,
    )
    assert result.from_cache
    assert result.cache_key == key


def test_client_cache_key_is_stable_for_same_input(tmp_path: Path) -> None:
    client = NanoBananaClient(api_key="fake:key", cache_dir=tmp_path)
    a = client._cache_key(
        model="m",
        body={"prompt": "hi", "aspect_ratio": "3:2", "num_images": 1},
        base_image_hash=None,
    )
    b = client._cache_key(
        model="m",
        body={"num_images": 1, "prompt": "hi", "aspect_ratio": "3:2"},
        base_image_hash=None,
    )
    assert a == b


def test_client_downloads_and_caches_when_miss(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    client = NanoBananaClient(api_key="fake:key", cache_dir=tmp_path)

    def _fake_submit(*, model, body):  # noqa: ANN001, ANN003
        return "https://cdn.fal.run/fake.png", "req-123"

    def _fake_download(url: str) -> bytes:
        assert url == "https://cdn.fal.run/fake.png"
        return b"\x89PNG\r\n\x1a\nfake-body"

    monkeypatch.setattr(client, "_submit_and_poll", _fake_submit)
    monkeypatch.setattr(client, "_download_bytes", _fake_download)

    out: GeneratedImage = client.text_to_image(
        prompt="a Pinterest-grade mood board",
        aspect_ratio="3:2",
    )
    assert not out.from_cache
    assert out.request_id == "req-123"
    assert out.bytes_size > 0
    assert out.path.exists()

    # Second call returns cached without invoking _submit_and_poll.
    def _explode(*a, **kw):  # noqa: ANN001, ANN003
        raise AssertionError("should be a cache hit")

    monkeypatch.setattr(client, "_submit_and_poll", _explode)
    again = client.text_to_image(
        prompt="a Pinterest-grade mood board",
        aspect_ratio="3:2",
    )
    assert again.from_cache
    assert again.path == out.path


# --------------------------------------------------- demo fallback (no fal.ai)


def _seed_pool_pngs(cache_dir: Path) -> tuple[Path, Path]:
    """Drop two PIL-readable PNGs in cache_dir at 3:2 and 4:3 ratios.

    Returns (hero_png, item_png). Used by the demo-fallback tests below.
    """

    from PIL import Image  # type: ignore[import-untyped]

    hero = cache_dir / "pool_hero_3x2.png"
    item = cache_dir / "pool_item_4x3.png"
    Image.new("RGB", (300, 200), color=(47, 74, 63)).save(hero)
    Image.new("RGB", (320, 240), color=(232, 197, 71)).save(item)
    return hero, item


def test_demo_fallback_serves_from_pool_when_no_cache_match(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """In demo mode, an unseen prompt picks a deterministic pool image
    instead of calling fal.ai. The picked bytes are written to the
    prompt's cache_path so subsequent identical requests are real hits.
    """

    monkeypatch.delenv("FAL_KEY", raising=False)
    hero_seed, item_seed = _seed_pool_pngs(tmp_path)
    # Demo mode allows construction without FAL_KEY.
    client = NanoBananaClient(cache_dir=tmp_path, demo_fallback=True)
    assert client.demo_fallback is True

    # Booby-trap the fal.ai paths — they must never be reached.
    def _explode(*a, **kw):  # noqa: ANN001, ANN003
        raise AssertionError("demo fallback must not call fal.ai")

    monkeypatch.setattr(client, "_submit_and_poll", _explode)
    monkeypatch.setattr(client, "_download_bytes", _explode)

    out = client.text_to_image(
        prompt="never-before-seen editorial mood for tech_startup",
        aspect_ratio="3:2",
    )
    assert not out.from_cache
    assert out.request_id == "demo-fallback"
    assert out.path.exists() and out.bytes_size > 0
    # The cache_path was written from the seed file's bytes.
    assert out.path.read_bytes() == hero_seed.read_bytes()

    # Same prompt again is now a true cache hit.
    again = client.text_to_image(
        prompt="never-before-seen editorial mood for tech_startup",
        aspect_ratio="3:2",
    )
    assert again.from_cache
    assert again.cache_key == out.cache_key

    # 4:3 picks from the item bucket, not the hero bucket.
    item_out = client.text_to_image(
        prompt="never-before-seen Vitra Eames in studio",
        aspect_ratio="4:3",
    )
    assert item_out.path.read_bytes() == item_seed.read_bytes()


def test_demo_fallback_picking_is_deterministic_per_prompt(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Same prompt → same pool pick on every cold start. Different
    prompts on the same aspect ratio MAY collide (single-bucket pool of
    2), so we only assert determinism, not uniqueness here."""

    from PIL import Image  # type: ignore[import-untyped]

    monkeypatch.delenv("FAL_KEY", raising=False)
    # Three distinct hero pool images so different prompts can land on
    # different picks.
    for i, color in enumerate([(10, 20, 30), (40, 50, 60), (70, 80, 90)]):
        Image.new("RGB", (300, 200), color=color).save(
            tmp_path / f"pool_hero_{i}.png"
        )
    client = NanoBananaClient(cache_dir=tmp_path, demo_fallback=True)
    monkeypatch.setattr(
        client, "_submit_and_poll",
        lambda **_: (_ for _ in ()).throw(AssertionError("no fal.ai")),
    )
    monkeypatch.setattr(
        client, "_download_bytes",
        lambda *_a, **_k: (_ for _ in ()).throw(AssertionError("no fal.ai")),
    )

    a1 = client.text_to_image(prompt="prompt-A", aspect_ratio="3:2")
    a2 = client.text_to_image(prompt="prompt-A", aspect_ratio="3:2")
    # Same prompt → same cache_path (already a true hit on second call).
    assert a1.path == a2.path

    # Wipe just `a1`'s cache_path so we can re-pick. Pool stays the same.
    a1.path.unlink()
    a3 = client.text_to_image(prompt="prompt-A", aspect_ratio="3:2")
    # Pick was reproducible: same bytes as the first pick.
    assert a3.bytes_size == a1.bytes_size


def test_demo_fallback_env_var_toggles_mode(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.delenv("FAL_KEY", raising=False)
    monkeypatch.setenv("MOODBOARD_DEMO_FALLBACK", "1")
    client = NanoBananaClient(cache_dir=tmp_path)
    assert client.demo_fallback is True

    monkeypatch.setenv("MOODBOARD_DEMO_FALLBACK", "0")
    monkeypatch.setenv("FAL_KEY", "fake:key")
    client2 = NanoBananaClient(cache_dir=tmp_path)
    assert client2.demo_fallback is False


# ------------------------------------------------------- visual mood board prompt


def test_compose_prompt_embeds_industry_register_and_variant_atmosphere() -> None:
    plan, variant = _load_sample_variant()
    req = VisualMoodBoardRequest(
        client_name="Altamont & Rees",
        industry="law_firm",
        variant=variant,
        aspect_ratio="3:2",
    )
    prompt = compose_prompt(req)

    # Industry register for law firms must land verbatim in the prompt
    # — otherwise NanoBanana will drift back to generic office stock.
    assert "Farrow & Ball" in prompt or "London partnership" in prompt
    # Variant atmosphere for villageois / atelier / hybride_flex.
    assert any(
        cue.split(" — ")[0] in prompt
        for cue in VARIANT_ATMOSPHERE.values()
    )
    # The client name is preserved for the cinematic framing.
    assert "Altamont" in prompt


def test_compose_prompt_inherits_palette_hex_from_selection() -> None:
    plan, variant = _load_sample_variant()
    selection = {
        "atmosphere": {
            "palette": [
                {"hex": "#2F4A3F", "name": "forest"},
                {"hex": "#C9B79C", "name": "sand"},
                {"hex": "#E8C547", "name": "sun"},
            ]
        }
    }
    req = VisualMoodBoardRequest(
        client_name="Lumen",
        industry="tech_startup",
        variant=variant,
        mood_board_selection=selection,
    )
    prompt = compose_prompt(req)
    for hx in ("#2F4A3F", "#C9B79C", "#E8C547"):
        assert hx in prompt, f"palette hex {hx} missing from prompt"


def test_compose_prompt_fuses_macro_and_micro_summaries() -> None:
    plan, variant = _load_sample_variant()
    req = VisualMoodBoardRequest(
        client_name="Lumen",
        industry="tech_startup",
        variant=variant,
        macro_zoning_summary="Three team neighbourhoods south, collab core, café west.",
        micro_zoning_summary="Focus stripe at the south façade, phone booths along the core.",
    )
    prompt = compose_prompt(req)
    assert "team neighbourhoods" in prompt
    assert "Focus stripe" in prompt or "phone booths" in prompt


def test_industry_register_covers_all_eight_enum_values() -> None:
    # The type checker already restricts to the literal, but missing a
    # key in the runtime map would quietly fall back to "other" — we
    # want every industry to carry a bespoke register.
    for industry in [
        "tech_startup",
        "law_firm",
        "bank_insurance",
        "consulting",
        "creative_agency",
        "healthcare",
        "public_sector",
        "other",
    ]:
        assert industry in INDUSTRY_REGISTER
        assert len(INDUSTRY_REGISTER[industry]) > 30


# ---------------------------------------------------- visual mood board surface


def test_visual_surface_returns_response_and_relative_path(tmp_path: Path) -> None:
    plan, variant = _load_sample_variant()
    # Build a client that short-circuits the network.
    client = NanoBananaClient(api_key="fake:key", cache_dir=tmp_path)

    canned = GeneratedImage(
        path=tmp_path / "canned.png",
        cache_key="deadbeef" * 4,
        prompt="...",
        model=client.text_to_image_model,
        aspect_ratio="3:2",
        from_cache=False,
        request_id="req-x",
        bytes_size=123,
    )
    (canned.path).write_bytes(b"\x89PNG\r\n\x1a\nfake")

    def _fake_t2i(**kwargs):  # noqa: ANN003
        return canned

    client.text_to_image = _fake_t2i  # type: ignore[method-assign]

    surface = VisualMoodBoardSurface(client=client)
    resp = surface.generate(
        VisualMoodBoardRequest(
            client_name="Lumen",
            industry="tech_startup",
            variant=variant,
        )
    )
    assert resp.visual_image_id == canned.cache_key
    assert resp.model == client.text_to_image_model
    assert resp.aspect_ratio == "3:2"
    assert resp.bytes_size == 123


# ------------------------------------------------------- zone overlay surface


def test_zone_overlay_fallback_to_svg_without_nanobanana(tmp_path: Path) -> None:
    plan, variant = _load_sample_variant()
    surface = ZoneOverlaySurface(client=None)  # simulate no FAL_KEY
    resp = surface.generate(
        ZoneOverlayRequest(
            floor_plan=plan,
            variant=variant,
            use_nanobanana=False,
        )
    )
    assert resp.fallback_used
    assert resp.fallback_reason == "nanobanana_disabled"
    # SVG must be cached on disk.
    assert resp.svg_path_rel.endswith(".svg")


def test_zone_overlay_fallback_when_cairosvg_unavailable(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """If cairosvg isn't importable, we fall back to serving the SVG
    itself — never raise, never crash the demo."""

    plan, variant = _load_sample_variant()
    client = NanoBananaClient(api_key="fake:key", cache_dir=tmp_path)
    # Force the rasterise helper to return False.
    from app.surfaces import zone_overlay as zo

    monkeypatch.setattr(zo, "_try_rasterise_svg", lambda *a, **kw: False)
    surface = ZoneOverlaySurface(client=client)
    resp = surface.generate(
        ZoneOverlayRequest(floor_plan=plan, variant=variant, use_nanobanana=True)
    )
    assert resp.fallback_used
    assert "rasterise_unavailable" in (resp.fallback_reason or "")
    assert resp.svg_path_rel.endswith(".svg")


def test_zone_overlay_prompt_mentions_architectural_precision() -> None:
    plan, variant = _load_sample_variant()
    from app.surfaces.zone_overlay import _build_overlay_prompt

    prompt = _build_overlay_prompt(variant, "sharpen zone fill")
    assert "architectural drawing precision" in prompt
    # Palette hexes from the directive.
    for hx in ("#3A5A4F", "#C9B79C", "#A0522D", "#E8C547", "#6B8F7F"):
        assert hx in prompt
    assert "legend" in prompt.lower()
