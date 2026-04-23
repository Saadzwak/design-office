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
    ) -> None:
        self.api_key = api_key or os.environ.get("FAL_KEY")
        if not self.api_key:
            raise NanoBananaError(
                "FAL_KEY is not set — visual generation is unavailable."
            )
        default_cache = (
            Path(__file__).resolve().parent.parent / "data" / "generated_images"
        )
        self.cache_dir = Path(
            cache_dir
            or os.environ.get("NANOBANANA_CACHE_DIR")
            or default_cache
        )
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


# Module-level convenience for tests / debug scripts.
def build_client_from_env() -> NanoBananaClient:
    return NanoBananaClient()
