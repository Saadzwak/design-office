"""FastAPI entrypoint for the Design Office backend."""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app import __version__
from app.config import get_settings

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
