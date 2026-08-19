from __future__ import annotations

from datetime import datetime
from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class SignupRequest(StrictModel):
    email: EmailStr
    password: str = Field(min_length=12, max_length=256)
    organizationName: str = Field(min_length=1, max_length=120)
    timeZone: str = Field(default="UTC", min_length=1, max_length=80)


class LoginRequest(StrictModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=256)


class AuthResponse(StrictModel):
    userId: UUID
    organizationId: UUID
    email: EmailStr
    csrfToken: str


class EnrollmentRequest(StrictModel):
    name: str = Field(min_length=1, max_length=120)


class EnrollmentResponse(StrictModel):
    enrollmentCode: str
    expiresAt: datetime


class DeviceActivationRequest(StrictModel):
    enrollmentCode: str = Field(min_length=20, max_length=200)
    name: str = Field(min_length=1, max_length=120)
    platform: Literal["chrome-extension"]
    clientVersion: str = Field(min_length=1, max_length=40)
    capabilities: list[str] = Field(max_length=50)


class DeviceTokenResponse(StrictModel):
    deviceId: UUID
    organizationId: UUID
    userId: UUID
    accessToken: str
    accessExpiresAt: datetime
    refreshToken: str
    refreshExpiresAt: datetime
    signingKeyId: str
    signingPublicKey: str


class DeviceRefreshRequest(StrictModel):
    deviceId: UUID
    refreshToken: str = Field(min_length=20, max_length=200)


class ProposalRequest(StrictModel):
    text: str = Field(min_length=1, max_length=1000)
    timeZone: str = Field(default="UTC", min_length=1, max_length=80)


class ProposalResponse(StrictModel):
    proposalId: UUID
    sourceText: str
    policy: dict[str, Any]
    schedules: list[dict[str, Any]]
    warnings: list[str]
    requiresConfirmation: Literal[True] = True
    expiresAt: datetime


class ConfirmProposalRequest(StrictModel):
    proposalId: UUID
    confirmation: Literal["CONFIRM"]


class ConfirmProposalResponse(StrictModel):
    policyId: UUID
    snapshotVersion: int


class BlockEventRequest(StrictModel):
    eventId: UUID
    policyId: UUID
    ruleId: UUID
    decision: Literal["WARN", "LIMIT", "BLOCK", "ESCALATE"]
    reasonCode: str = Field(min_length=1, max_length=80)
    matchedConfiguredDomain: str = Field(min_length=1, max_length=253)
    occurredAt: datetime
    snapshotVersion: int = Field(gt=0)
    clientVersion: str = Field(min_length=1, max_length=40)

    @field_validator("matchedConfiguredDomain")
    @classmethod
    def reject_url_material(cls, value: str) -> str:
        if any(character in value for character in "/?#@"):
            raise ValueError("event domain must not contain URL path or credential material")
        return value.lower().rstrip(".")


class BlockEventBatch(StrictModel):
    events: list[BlockEventRequest] = Field(max_length=100)


class HealthResponse(StrictModel):
    status: Literal["ok"] = "ok"
    service: Literal["focusguard-api"] = "focusguard-api"
