from typing import Optional
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    DATABASE_URL: Optional[str] = None
    GEMINI_API_KEY: Optional[str] = None
    GEMINI_MODEL: str = "gemini-3.8-flash"
    GEMINI_FALLBACK_MODELS: str = "gemini-3.7-flash"
    SECRET_KEY: str = "brandpilot-insecure-dev-secret-key-change-in-prod-12345"
    PUBLIC_BASE_URL: str = "http://localhost:8000"

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    @property
    def fallback_models_list(self) -> list[str]:
        if not self.GEMINI_FALLBACK_MODELS:
            return []
        return [m.strip() for m in self.GEMINI_FALLBACK_MODELS.split(",") if m.strip()]

    @property
    def sqlalchemy_database_url(self) -> str:
        if not self.DATABASE_URL or not self.DATABASE_URL.strip():
            return "sqlite:///./brandpilot.db"

        url = self.DATABASE_URL.strip()
        if url.startswith("postgres://"):
            url = url.replace("postgres://", "postgresql://", 1)
        return url


settings = Settings()
