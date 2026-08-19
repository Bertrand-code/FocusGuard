from functools import lru_cache
from typing import Literal

from pydantic import Field, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="FOCUSGUARD_", env_file=".env", extra="ignore")

    environment: Literal["development", "test", "production"] = "development"
    store: Literal["memory", "postgres"] = "memory"
    database_url: str = "postgresql://focusguard:change-me@localhost:5432/focusguard"
    redis_url: str | None = None
    allowed_origins: list[str] = Field(default_factory=lambda: ["http://localhost:3000"])
    session_cookie_secure: bool = True
    session_cookie_name: str = "__Host-focusguard_session"
    password_pepper: str = ""
    policy_signing_private_key: str | None = None
    policy_signing_key_id: str = "development-ephemeral"
    activity_upload_enabled: bool = False

    @model_validator(mode="after")
    def validate_production(self) -> "Settings":
        if self.environment == "production":
            if self.store != "postgres":
                raise ValueError("production requires the PostgreSQL store")
            if not self.redis_url:
                raise ValueError("production requires Redis-backed rate limiting")
            if not self.password_pepper or len(self.password_pepper) < 32:
                raise ValueError("production requires a password pepper of at least 32 characters")
            if not self.policy_signing_private_key:
                raise ValueError("production requires a policy signing key")
            if not self.session_cookie_secure:
                raise ValueError("production session cookies must be secure")
        if not self.session_cookie_secure and self.session_cookie_name.startswith("__Host-"):
            self.session_cookie_name = "focusguard_session"
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()
