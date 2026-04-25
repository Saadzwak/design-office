"""fal.ai NanoBanana Pro client — iter-17 C.

NanoBanana Pro (branded alias for Gemini 3 Pro Image on fal.ai) is the
visual generator Design Office uses for :

- Pinterest-style composite mood boards (text-to-image),
- 2D floor-plan zone overlays (image-to-image on the client's plan).

The client is intentionally minimal : we go through the public queue
API directly, avoiding the `fal-client` Python SDK so the dependency
surface stays small. Every generated image is cached on disk so the
same prompt + model + aspect ratio does not bill twice.

## Auth

`FAL_KEY` must be set in the environment. Typical format :
`<key_id>:<key_secret>`. The header is `Authorization: Key <FAL_KEY>`.

## Queue API shape (recap from probing on 2026-04-23)

```
POST https://queue.fal.run/<model-id>                 → 200 { request_id, status_url }
GET  <status_url>                                     → 200 { status: IN_PROGRESS|COMPLETED|FAILED }
GET  <response_url>                                   → 200 { images: [{ url, content_type, ... }] }
```

The client polls `status_url` until `COMPLETED`, then downloads the
first image from the response. Timeouts and 5xx are retried with
exponential backoff.
"""

from __future__ import annotations

import hashlib
import json
import logging
import os
import time
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from pathlib import Path
from typing import Any


log = logging.getLogger(__name__)


QUEUE_BASE = "https://queue.fal.run"
# fal.ai exposes the Pro model at the bare model-id (NOT /text-to-image).
# Probed against queue.fal.run on 2026-04-23 : the /text-to-image suffix
# returns 404 on the Pro model ; the base path defaults to t2i behaviour.
DEFAULT_TEXT_TO_IMAGE_MODEL = "fal-ai/nano-banana-pro"
DEFAULT_IMAGE_TO_IMAGE_MODEL = "fal-ai/nano-banana-pro/edit"
# Fallback models used by the non-Pro tier (still useful when the Pro
# quota is exhausted or rotated).
FALLBACK_TEXT_TO_IMAGE_MODEL = "fal-ai/nano-banana"
FALLBACK_IMAGE_TO_IMAGE_MODEL = "fal-ai/nano-banana/edit"


class NanoBananaError(RuntimeError):
    """Any failure from fal.ai that we couldn't recover from."""


@dataclass(frozen=True)
class GeneratedImage:
    """Return shape of `text_to_image` / `image_to_image`."""

    path: Path                       # absolute path on disk
    cache_key: str                   # sha256 digest used in the filename
    prompt: str
    model: str
    aspect_ratio: str
    from_cache: bool
    request_id: str | None = None    # fal.ai request id (None on cache hit)
    bytes_size: int = 0


class NanoBananaClient:
    """Minimal async-free fal.ai NanoBanana client with disk caching."""

    def __init__(
        self,
        *,
        api_key: str | None = None,
        cache_dir: Path | None = None,
        timeout_s: float = 120.0,
        poll_interval_s: float = 2.0,
        max_retries: int = 3,
        text_to_image_model: str = DEFAULT_TEXT_TO_IMAGE_MODEL,
        image_to_image_model: str = DEFAULT_IMAGE_TO_IMAGE_MODEL,
        demo_fallback: bool | None = None,
    ) -> None:
        # Demo fallback: when fal.ai credits are exhausted (or for offline
        # demos), the client picks a deterministic image from the existing
        # cache pool instead of submitting a fresh request. The picked
        # image is written to the prompt's cache_path so the next call
        # for the same selection is a true cache hit. Toggle via
        # `MOODBOARD_DEMO_FALLBACK=1` (env) or the constructor arg.
        if demo_fallback is None:
            demo_fallback = os.environ.get("MOODBOARD_DEMO_FALLBACK", "").strip() in (
                "1", "true", "True", "yes",
            )
        self.demo_fallback = bool(demo_fallback)
        self._demo_pool: dict[str, list[Path]] | None = None
        # In demo mode `FAL_KEY` is optional — the client never reaches
        # the fal.ai endpoint. Outside demo mode it is required.
        self.api_key = api_key or os.environ.get("FAL_KEY")
        if not self.api_key and not self.demo_fallback:
            raise NanoBananaError(
                "FAL_KEY is not set — visual generation is unavailable."
            )
        # Path layout:
        #   `__file__`        = <repo>/backend/app/services/nanobanana_client.py
        #   `backend_root`    = <repo>/backend/app/
        #   `repo_root`       = <repo>/
        # Default cache is `<repo>/backend/app/data/generated_images/`.
        backend_root = Path(__file__).resolve().parent.parent
        repo_root = backend_root.parent.parent
        default_cache = backend_root / "data" / "generated_images"
        # Iter-30B fix: a relative `NANOBANANA_CACHE_DIR` env override
        # used to resolve against `os.getcwd()`, which produced a doubled
        # `backend/backend/` path when uvicorn was launched from `cd
        # backend/`. We now resolve any relative override against the
        # repo root, which is the same regardless of how the server is
        # started. Absolute overrides are preserved verbatim.
        env_override = os.environ.get("NANOBANANA_CACHE_DIR")
        if cache_dir is not None:
            self.cache_dir = Path(cache_dir)
        elif env_override:
            override = Path(env_override)
            self.cache_dir = (
                override if override.is_absolute() else repo_root / override
            )
        else:
            self.cache_dir = default_cache
        # Final safety net: if the resolved path contains a doubled
        # `backend/backend/` segment (legacy bug surface) and the
        # canonical location is populated, prefer the canonical one
        # so we don't orphan existing cache files.
        resolved_str = str(self.cache_dir).replace("\\", "/")
        if "backend/backend" in resolved_str and default_cache.exists():
            self.cache_dir = default_cache
        self.cache_dir.mkdir(parents=True, exist_ok=True)
        self.timeout_s = timeout_s
        self.poll_interval_s = poll_interval_s
        self.max_retries = max_retries
        self.text_to_image_model = text_to_image_model
        self.image_to_image_model = image_to_image_model

    # --------------------------------------------------------------- public

    def text_to_image(
        self,
        prompt: str,
        *,
        aspect_ratio: str = "3:2",
        num_images: int = 1,
        output_format: str = "png",
        extra_params: dict[str, Any] | None = None,
    ) -> GeneratedImage:
        body: dict[str, Any] = {
            "prompt": prompt,
            "num_images": num_images,
            "output_format": output_format,
            # fal.ai supports `aspect_ratio` (newer) or `image_size`
            # (older) — send both to cover the span.
            "aspect_ratio": aspect_ratio,
        }
        if extra_params:
            body.update(extra_params)
        return self._generate(
            model=self.text_to_image_model,
            body=body,
            aspect_ratio=aspect_ratio,
            base_image_hash=None,
        )

    def image_to_image(
        self,
        base_image_path: Path | str,
        prompt: str,
        *,
        aspect_ratio: str = "3:2",
        strength: float = 0.6,
        num_images: int = 1,
        output_format: str = "png",
        extra_params: dict[str, Any] | None = None,
    ) -> GeneratedImage:
        base = Path(base_image_path)
        if not base.exists():
            raise NanoBananaError(f"Base image not found: {base}")
        raw = base.read_bytes()
        base_hash = hashlib.sha256(raw).hexdigest()
        # fal.ai accepts either an uploaded https URL or a base64 data URI.
        # Data URIs are simpler for our size (≤ 5 MB renders).
        import base64

        data_uri = f"data:image/{base.suffix.lstrip('.') or 'png'};base64,{base64.b64encode(raw).decode()}"
        body: dict[str, Any] = {
            "prompt": prompt,
            "image_url": data_uri,
            "num_images": num_images,
            "output_format": output_format,
            "strength": strength,
            "aspect_ratio": aspect_ratio,
        }
        if extra_params:
            body.update(extra_params)
        return self._generate(
            model=self.image_to_image_model,
            body=body,
            aspect_ratio=aspect_ratio,
            base_image_hash=base_hash,
        )

    # --------------------------------------------------------------- internal

    def _cache_key(
        self,
        *,
        model: str,
        body: dict[str, Any],
        base_image_hash: str | None,
    ) -> str:
        """Stable digest over (model, prompt, aspect_ratio, base_image)."""

        norm = {
            "model": model,
            "prompt": body.get("prompt", ""),
            "aspect_ratio": body.get("aspect_ratio", ""),
            "strength": body.get("strength"),
            "num_images": body.get("num_images", 1),
            "base_image": base_image_hash,
        }
        blob = json.dumps(norm, sort_keys=True, ensure_ascii=False).encode()
        return hashlib.sha256(blob).hexdigest()[:32]

    def _cache_path(self, key: str, output_format: str) -> Path:
        return self.cache_dir / f"{key}.{output_format}"

    def _generate(
        self,
        *,
        model: str,
        body: dict[str, Any],
        aspect_ratio: str,
        base_image_hash: str | None,
    ) -> GeneratedImage:
        key = self._cache_key(model=model, body=body, base_image_hash=base_image_hash)
        output_format = str(body.get("output_format", "png"))
        cached = self._cache_path(key, output_format)
        if cached.exists() and cached.stat().st_size > 0:
            return GeneratedImage(
                path=cached,
                cache_key=key,
                prompt=str(body.get("prompt", "")),
                model=model,
                aspect_ratio=aspect_ratio,
                from_cache=True,
                bytes_size=cached.stat().st_size,
            )

        if self.demo_fallback:
            # Demo mode: pick a deterministic image from the existing pool
            # by aspect ratio + stable hash of the prompt. Write it to the
            # prompt's cache_path so subsequent identical requests hit the
            # real cache. We never reach fal.ai in this branch.
            pool_path = self._pick_demo_fallback(
                prompt=str(body.get("prompt", "")),
                aspect_ratio=aspect_ratio,
                exclude=cached.resolve(),
            )
            if pool_path is not None:
                cached.write_bytes(pool_path.read_bytes())
                log.info(
                    "demo fallback: served %s for aspect %s (prompt hash %s)",
                    pool_path.name, aspect_ratio, key[:8],
                )
                return GeneratedImage(
                    path=cached,
                    cache_key=key,
                    prompt=str(body.get("prompt", "")),
                    model=model,
                    aspect_ratio=aspect_ratio,
                    from_cache=False,
                    request_id="demo-fallback",
                    bytes_size=cached.stat().st_size,
                )
            # Pool empty / no match for ratio — fall through to fal.ai so
            # we don't return a broken image. If fal.ai also fails, the
            # caller surface degrades gracefully (per-item failures don't
            # crash the response).
            log.warning(
                "demo fallback: no pool image for aspect %s, attempting fal.ai",
                aspect_ratio,
            )

        try:
            image_url, request_id = self._submit_and_poll(model=model, body=body)
        except NanoBananaError:
            raise
        except Exception as exc:  # noqa: BLE001
            raise NanoBananaError(f"Unexpected error talking to fal.ai: {exc}") from exc

        png_bytes = self._download_bytes(image_url)
        cached.write_bytes(png_bytes)
        return GeneratedImage(
            path=cached,
            cache_key=key,
            prompt=str(body.get("prompt", "")),
            model=model,
            aspect_ratio=aspect_ratio,
            from_cache=False,
            request_id=request_id,
            bytes_size=len(png_bytes),
        )

    def _submit_and_poll(
        self, *, model: str, body: dict[str, Any]
    ) -> tuple[str, str]:
        """Submit to the queue API, poll until COMPLETED, return (image_url, request_id)."""

        submit_url = f"{QUEUE_BASE}/{model}"
        payload = self._request_json(
            submit_url,
            method="POST",
            body_bytes=json.dumps(body).encode(),
        )
        request_id = str(payload.get("request_id", ""))
        status_url = str(payload.get("status_url", ""))
        response_url = str(payload.get("response_url", ""))
        if not status_url or not response_url:
            raise NanoBananaError(
                f"fal.ai did not return status/response URLs: {payload}"
            )

        deadline = time.monotonic() + self.timeout_s
        while time.monotonic() < deadline:
            status_payload = self._request_json(status_url, method="GET")
            status = str(status_payload.get("status", ""))
            if status == "COMPLETED":
                break
            if status in ("FAILED", "CANCELLED"):
                raise NanoBananaError(
                    f"fal.ai request {request_id} ended in {status}: {status_payload}"
                )
            time.sleep(self.poll_interval_s)
        else:
            raise NanoBananaError(
                f"fal.ai request {request_id} did not complete within {self.timeout_s}s"
            )

        response_payload = self._request_json(response_url, method="GET")
        images = response_payload.get("images") or []
        if not images:
            # Some models return `image` (singular) or nest under `data`.
            for key in ("image", "data"):
                cand = response_payload.get(key)
                if cand:
                    images = cand if isinstance(cand, list) else [cand]
                    break
        if not images:
            raise NanoBananaError(
                f"fal.ai returned no images for request {request_id}: {response_payload}"
            )
        first = images[0]
        url = first.get("url") if isinstance(first, dict) else None
        if not url:
            raise NanoBananaError(
                f"fal.ai returned an image entry without URL: {first}"
            )
        return str(url), request_id

    def _request_json(
        self,
        url: str,
        *,
        method: str,
        body_bytes: bytes | None = None,
    ) -> dict[str, Any]:
        """HTTP helper with retries on 5xx / connection errors."""

        last_exc: Exception | None = None
        for attempt in range(1, self.max_retries + 1):
            try:
                req = urllib.request.Request(
                    url,
                    data=body_bytes,
                    method=method,
                    headers={
                        "Authorization": f"Key {self.api_key}",
                        "Content-Type": "application/json",
                        "Accept": "application/json",
                    },
                )
                with urllib.request.urlopen(req, timeout=30) as resp:
                    raw = resp.read().decode()
                    return json.loads(raw) if raw else {}
            except urllib.error.HTTPError as exc:
                if 500 <= exc.code < 600 and attempt < self.max_retries:
                    wait = 2 ** attempt
                    log.warning("fal.ai %s %s → HTTP %d, retry #%d in %ds",
                                method, url, exc.code, attempt, wait)
                    time.sleep(wait)
                    last_exc = exc
                    continue
                body = exc.read().decode(errors="replace")[:400] if exc.fp else ""
                raise NanoBananaError(
                    f"fal.ai {method} {url} → HTTP {exc.code}: {body}"
                ) from exc
            except (urllib.error.URLError, TimeoutError) as exc:
                if attempt < self.max_retries:
                    wait = 2 ** attempt
                    log.warning("fal.ai %s %s connection error (%s), retry #%d in %ds",
                                method, url, exc, attempt, wait)
                    time.sleep(wait)
                    last_exc = exc
                    continue
                raise NanoBananaError(f"fal.ai connection error on {url}: {exc}") from exc
        raise NanoBananaError(f"fal.ai {method} {url} exhausted retries: {last_exc}")

    def _download_bytes(self, url: str) -> bytes:
        last_exc: Exception | None = None
        for attempt in range(1, self.max_retries + 1):
            try:
                with urllib.request.urlopen(url, timeout=60) as resp:
                    return resp.read()
            except (urllib.error.URLError, TimeoutError) as exc:
                if attempt < self.max_retries:
                    time.sleep(2 ** attempt)
                    last_exc = exc
                    continue
                raise NanoBananaError(f"fal.ai image download failed for {url}: {exc}") from exc
        raise NanoBananaError(f"fal.ai image download exhausted retries: {last_exc}")

    # --------------------------------------------------------------- demo

    def _build_demo_pool(self) -> dict[str, list[Path]]:
        """Classify cached PNGs by aspect ratio for demo fallback picks.

        Reads each PNG header (PIL only loads the metadata, not pixels)
        and buckets by `3:2` (hero gallery) or `4:3` (item tiles). Other
        ratios go to the `any` bucket as a last-resort fallback.
        """

        try:
            from PIL import Image  # type: ignore[import-untyped]
        except ImportError:
            log.warning("Pillow unavailable; demo pool empty")
            return {"3:2": [], "4:3": [], "any": []}

        pool: dict[str, list[Path]] = {"3:2": [], "4:3": [], "any": []}
        for png in sorted(self.cache_dir.glob("*.png")):
            try:
                with Image.open(png) as im:
                    w, h = im.size
            except Exception:  # noqa: BLE001
                continue
            if h <= 0:
                continue
            ratio = w / h
            pool["any"].append(png)
            if abs(ratio - 1.5) < 0.05:
                pool["3:2"].append(png)
            elif abs(ratio - 4 / 3) < 0.05:
                pool["4:3"].append(png)
        log.info(
            "demo pool: %d/3:2 + %d/4:3 + %d/any (cache_dir=%s)",
            len(pool["3:2"]), len(pool["4:3"]), len(pool["any"]),
            self.cache_dir,
        )
        return pool

    def _pick_demo_fallback(
        self,
        *,
        prompt: str,
        aspect_ratio: str,
        exclude: Path | None = None,
    ) -> Path | None:
        """Pick a deterministic pool image for the prompt + aspect ratio.

        Picking is stable across runs : sha256(prompt) % len(pool). Same
        prompt → same image, so the user never sees the moodboard "shuffle"
        between renders. Different prompts (e.g. same SKU under three
        directions) get different picks, preserving visual variety.
        """

        if self._demo_pool is None:
            self._demo_pool = self._build_demo_pool()
        bucket = self._demo_pool.get(aspect_ratio) or self._demo_pool.get("any") or []
        # Drop the file we'd be writing to (in case it's already in the
        # pool from a previous demo fallback) so we never seed it from
        # itself.
        if exclude is not None:
            try:
                bucket = [p for p in bucket if p.resolve() != exclude]
            except OSError:
                pass
        if not bucket:
            return None
        digest = hashlib.sha256(prompt.encode("utf-8", errors="replace")).hexdigest()
        idx = int(digest[:12], 16) % len(bucket)
        return bucket[idx]


# Module-level convenience for tests / debug scripts.
def build_client_from_env() -> NanoBananaClient:
    return NanoBananaClient()
