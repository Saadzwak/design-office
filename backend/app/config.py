"""Runtime configuration loaded from .env / environment."""

from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    anthropic_api_key: str | None = Field(default=None, alias="ANTHROPIC_API_KEY")
    anthropic_model: str = Field(default="claude-opus-4-7", alias="ANTHROPIC_MODEL")

    backend_host: str = Field(default="127.0.0.1", alias="BACKEND_HOST")
    backend_port: int = Field(default=8000, alias="BACKEND_PORT")
    frontend_port: int = Field(default=5173, alias="FRONTEND_PORT")

    sketchup_mcp_host: str = Field(default="127.0.0.1", alias="SKETCHUP_MCP_HOST")
    sketchup_mcp_port: int = Field(default=9876, alias="SKETCHUP_MCP_PORT")
    autocad_mcp_host: str = Field(default="127.0.0.1", alias="AUTOCAD_MCP_HOST")
    autocad_mcp_port: int = Field(default=9877, alias="AUTOCAD_MCP_PORT")

    nightly_input_tokens_budget: int = Field(
        default=300_000, alias="NIGHTLY_INPUT_TOKENS_BUDGET"
    )
    nightly_output_tokens_budget: int = Field(
        default=100_000, alias="NIGHTLY_OUTPUT_TOKENS_BUDGET"
    )


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
