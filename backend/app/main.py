"""FastAPI entrypoint for the Design Office backend."""

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from app import __version__
from app.config import get_settings
from app.surfaces.brief import (
    BriefRequest,
    BriefResponse,
    compile_default_surface,
    preview_resources_manifest,
)

settings = get_settings()

app = FastAPI(
    title="Design Office API",
    version=__version__,
    description="Opus 4.7 orchestrator powering the Design Office copilot for office fit-outs.",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        f"http://localhost:{settings.frontend_port}",
        f"http://127.0.0.1:{settings.frontend_port}",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health() -> dict[str, str | bool]:
    return {
        "status": "ok",
        "version": __version__,
        "model": settings.anthropic_model,
        "api_key_loaded": bool(settings.anthropic_api_key),
    }


@app.get("/api/brief/manifest")
def brief_manifest() -> dict:
    return preview_resources_manifest()


@app.post("/api/brief/synthesize", response_model=BriefResponse)
def brief_synthesize(payload: BriefRequest) -> BriefResponse:
    if not settings.anthropic_api_key:
        raise HTTPException(
            status_code=503,
            detail="ANTHROPIC_API_KEY is not loaded. Check .env at repo root.",
        )
    surface = compile_default_surface()
    return surface.synthesize(payload)
