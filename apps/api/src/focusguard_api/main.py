from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from datetime import UTC, datetime, timedelta
from typing import Annotated
from uuid import UUID, uuid4

from fastapi import Depends, FastAPI, HTTPException, Response, status
from fastapi.middleware.cors import CORSMiddleware

from .config import Settings, get_settings
from .dependencies import (
    SessionContext,
    get_store,
    require_csrf_session,
    require_device,
    require_session,
)
from .middleware import (
    LocalRateLimitMiddleware,
    RedisRateLimitMiddleware,
    SecurityHeadersMiddleware,
)
from .models import (
    AuthResponse,
    BlockEventBatch,
    ConfirmProposalRequest,
    ConfirmProposalResponse,
    DeviceActivationRequest,
    DeviceRefreshRequest,
    DeviceTokenResponse,
    EnrollmentRequest,
    EnrollmentResponse,
    HealthResponse,
    LoginRequest,
    ProposalRequest,
    ProposalResponse,
    SignupRequest,
)
from .policy_proposal import UnsupportedProposal, build_proposal
from .security import PasswordService, PolicySigner, isoformat, random_token, token_digest
from .store import (
    DeviceCredentialRecord,
    DeviceRecord,
    EnrollmentRecord,
    InMemoryStore,
    ProposalRecord,
    SessionRecord,
)


def create_app(settings: Settings | None = None, store: InMemoryStore | None = None) -> FastAPI:
    configured = settings or get_settings()

    @asynccontextmanager
    async def lifespan(application: FastAPI) -> AsyncIterator[None]:
        application.state.settings = configured
        if store is not None:
            application.state.store = store
        elif configured.store == "memory":
            application.state.store = InMemoryStore()
        else:
            raise RuntimeError(
                "The PostgreSQL repository is not implemented; refusing to fall back to memory"
            )
        application.state.passwords = PasswordService(configured.password_pepper)
        application.state.signer = PolicySigner.create(
            configured.policy_signing_key_id, configured.policy_signing_private_key
        )
        yield

    application = FastAPI(
        title="FocusGuard API",
        version="0.1.0",
        docs_url="/docs" if configured.environment != "production" else None,
        redoc_url=None,
        lifespan=lifespan,
    )
    application.add_middleware(SecurityHeadersMiddleware)
    if configured.redis_url:
        application.add_middleware(RedisRateLimitMiddleware, redis_url=configured.redis_url)
    else:
        application.add_middleware(LocalRateLimitMiddleware)
    application.add_middleware(
        CORSMiddleware,
        allow_origins=configured.allowed_origins,
        allow_credentials=True,
        allow_methods=["GET", "POST"],
        allow_headers=["Content-Type", "X-CSRF-Token", "Authorization"],
    )
    register_routes(application)
    return application


def _set_session_cookie(
    response: Response, settings: Settings, raw_session: str, expires_at: datetime
) -> None:
    response.set_cookie(
        key=settings.session_cookie_name,
        value=raw_session,
        expires=expires_at,
        secure=settings.session_cookie_secure,
        httponly=True,
        samesite="lax",
        path="/",
    )


def _create_session(
    store: InMemoryStore, user_id: UUID, organization_id: UUID
) -> tuple[str, str, datetime]:
    now = datetime.now(UTC)
    expires_at = now + timedelta(hours=12)
    raw_session = random_token()
    raw_csrf = random_token()
    store.save_session(
        SessionRecord(
            digest=token_digest(raw_session),
            user_id=user_id,
            organization_id=organization_id,
            csrf_digest=token_digest(raw_csrf),
            expires_at=expires_at,
        )
    )
    return raw_session, raw_csrf, expires_at


def _issue_device_tokens(
    store: InMemoryStore, device: DeviceRecord
) -> tuple[str, str, datetime, datetime]:
    now = datetime.now(UTC)
    access = random_token()
    refresh = random_token(48)
    access_expires = now + timedelta(minutes=15)
    refresh_expires = now + timedelta(days=30)
    store.save_device_credential(
        DeviceCredentialRecord(
            device_id=device.id,
            access_digest=token_digest(access),
            access_expires_at=access_expires,
            refresh_digest=token_digest(refresh),
            refresh_expires_at=refresh_expires,
        )
    )
    return access, refresh, access_expires, refresh_expires


def register_routes(application: FastAPI) -> None:
    @application.get("/healthz", response_model=HealthResponse)
    async def health() -> HealthResponse:
        return HealthResponse()

    @application.post("/v1/auth/signup", response_model=AuthResponse, status_code=201)
    async def signup(
        body: SignupRequest,
        response: Response,
        store: Annotated[InMemoryStore, Depends(get_store)],
    ) -> AuthResponse:
        try:
            user = store.create_user(
                str(body.email),
                application.state.passwords.hash(body.password),
                body.organizationName,
                body.timeZone,
            )
        except ValueError as exc:
            raise HTTPException(status.HTTP_409_CONFLICT, "Account cannot be created") from exc
        raw_session, raw_csrf, expires_at = _create_session(store, user.id, user.organization_id)
        _set_session_cookie(response, application.state.settings, raw_session, expires_at)
        return AuthResponse(
            userId=user.id,
            organizationId=user.organization_id,
            email=user.email,
            csrfToken=raw_csrf,
        )

    @application.post("/v1/auth/login", response_model=AuthResponse)
    async def login(
        body: LoginRequest,
        response: Response,
        store: Annotated[InMemoryStore, Depends(get_store)],
    ) -> AuthResponse:
        user = store.find_user_by_email(str(body.email))
        valid = user and application.state.passwords.verify(user.password_hash, body.password)
        if not user or not valid:
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Email or password is incorrect")
        raw_session, raw_csrf, expires_at = _create_session(store, user.id, user.organization_id)
        _set_session_cookie(response, application.state.settings, raw_session, expires_at)
        return AuthResponse(
            userId=user.id,
            organizationId=user.organization_id,
            email=user.email,
            csrfToken=raw_csrf,
        )

    @application.post("/v1/auth/logout", status_code=204)
    async def logout(
        response: Response,
        session: Annotated[SessionContext, Depends(require_csrf_session)],
        store: Annotated[InMemoryStore, Depends(get_store)],
    ) -> None:
        cookie_name = application.state.settings.session_cookie_name
        raw_session = response.headers.get(cookie_name)
        del raw_session
        session.session.revoked_at = datetime.now(UTC)
        response.delete_cookie(cookie_name, path="/")

    @application.get("/v1/auth/me")
    async def me(session: Annotated[SessionContext, Depends(require_session)]) -> dict[str, str]:
        return {
            "userId": str(session.user_id),
            "organizationId": str(session.organization_id),
        }

    @application.post("/v1/devices/enrollments", response_model=EnrollmentResponse, status_code=201)
    async def create_enrollment(
        body: EnrollmentRequest,
        session: Annotated[SessionContext, Depends(require_csrf_session)],
        store: Annotated[InMemoryStore, Depends(get_store)],
    ) -> EnrollmentResponse:
        raw_code = random_token(24)
        expires_at = datetime.now(UTC) + timedelta(minutes=10)
        store.save_enrollment(
            EnrollmentRecord(
                digest=token_digest(raw_code),
                user_id=session.user_id,
                organization_id=session.organization_id,
                requested_name=body.name,
                expires_at=expires_at,
            )
        )
        return EnrollmentResponse(enrollmentCode=raw_code, expiresAt=expires_at)

    @application.post("/v1/devices/activate", response_model=DeviceTokenResponse, status_code=201)
    async def activate_device(
        body: DeviceActivationRequest,
        store: Annotated[InMemoryStore, Depends(get_store)],
    ) -> DeviceTokenResponse:
        enrollment = store.consume_enrollment(body.enrollmentCode, datetime.now(UTC))
        if not enrollment:
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Enrollment code invalid or expired")
        device = DeviceRecord(
            id=uuid4(),
            organization_id=enrollment.organization_id,
            user_id=enrollment.user_id,
            name=body.name,
            platform=body.platform,
            client_version=body.clientVersion,
            capabilities=body.capabilities,
        )
        store.save_device(device)
        access, refresh, access_expires, refresh_expires = _issue_device_tokens(store, device)
        signer: PolicySigner = application.state.signer
        return DeviceTokenResponse(
            deviceId=device.id,
            organizationId=device.organization_id,
            userId=device.user_id,
            accessToken=access,
            accessExpiresAt=access_expires,
            refreshToken=refresh,
            refreshExpiresAt=refresh_expires,
            signingKeyId=signer.key_id,
            signingPublicKey=signer.public_key,
        )

    @application.post("/v1/devices/refresh", response_model=DeviceTokenResponse)
    async def refresh_device(
        body: DeviceRefreshRequest,
        store: Annotated[InMemoryStore, Depends(get_store)],
    ) -> DeviceTokenResponse:
        credential = store.rotate_device_credential(
            body.deviceId, body.refreshToken, datetime.now(UTC)
        )
        device = store.devices.get(body.deviceId) if credential else None
        if not device:
            raise HTTPException(
                status.HTTP_401_UNAUTHORIZED, "Refresh credential invalid or reused"
            )
        access, refresh, access_expires, refresh_expires = _issue_device_tokens(store, device)
        signer: PolicySigner = application.state.signer
        return DeviceTokenResponse(
            deviceId=device.id,
            organizationId=device.organization_id,
            userId=device.user_id,
            accessToken=access,
            accessExpiresAt=access_expires,
            refreshToken=refresh,
            refreshExpiresAt=refresh_expires,
            signingKeyId=signer.key_id,
            signingPublicKey=signer.public_key,
        )

    @application.post("/v1/policies/proposals", response_model=ProposalResponse, status_code=201)
    async def propose_policy(
        body: ProposalRequest,
        session: Annotated[SessionContext, Depends(require_csrf_session)],
        store: Annotated[InMemoryStore, Depends(get_store)],
    ) -> ProposalResponse:
        now = datetime.now(UTC)
        try:
            proposal = build_proposal(
                body.text, body.timeZone, session.organization_id, session.user_id, now
            )
        except UnsupportedProposal as exc:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, str(exc)) from exc
        record = ProposalRecord(
            id=UUID(proposal["proposalId"]),
            user_id=session.user_id,
            organization_id=session.organization_id,
            source_text=proposal["sourceText"],
            policy=proposal["policy"],
            schedules=proposal["schedules"],
            warnings=proposal["warnings"],
            expires_at=proposal["expiresAt"],
        )
        store.save_proposal(record)
        return ProposalResponse(**proposal)

    @application.post("/v1/policies", response_model=ConfirmProposalResponse, status_code=201)
    async def confirm_policy(
        body: ConfirmProposalRequest,
        session: Annotated[SessionContext, Depends(require_csrf_session)],
        store: Annotated[InMemoryStore, Depends(get_store)],
    ) -> ConfirmProposalResponse:
        confirmed = store.confirm_proposal(
            body.proposalId, session.user_id, session.organization_id, datetime.now(UTC)
        )
        if not confirmed:
            raise HTTPException(
                status.HTTP_409_CONFLICT, "Proposal is invalid, expired, or already used"
            )
        policy_id, version = confirmed
        return ConfirmProposalResponse(policyId=policy_id, snapshotVersion=version)

    @application.get("/v1/device/policy-snapshot")
    async def policy_snapshot(
        device: Annotated[DeviceRecord, Depends(require_device)],
        store: Annotated[InMemoryStore, Depends(get_store)],
    ) -> dict[str, object]:
        policies, schedules, version = store.policy_material(device.user_id)
        now = datetime.now(UTC)
        payload = {
            "schemaVersion": 1,
            "snapshotVersion": version,
            "organizationId": str(device.organization_id),
            "userId": str(device.user_id),
            "deviceId": str(device.id),
            "issuedAt": isoformat(now),
            "refreshAfter": isoformat(now + timedelta(minutes=5)),
            "validUntil": isoformat(now + timedelta(hours=24)),
            "failMode": "OPEN",
            "policies": policies,
            "schedules": schedules,
            "commitments": [],
            "focusSessions": [],
        }
        signer: PolicySigner = application.state.signer
        return signer.sign(payload)

    @application.post("/v1/device/block-events", status_code=202)
    async def upload_block_events(
        body: BlockEventBatch,
        device: Annotated[DeviceRecord, Depends(require_device)],
        store: Annotated[InMemoryStore, Depends(get_store)],
    ) -> dict[str, int | bool]:
        if not application.state.settings.activity_upload_enabled:
            return {"accepted": 0, "collectionEnabled": False}
        store.save_events(device, [event.model_dump(mode="json") for event in body.events])
        return {"accepted": len(body.events), "collectionEnabled": True}


app = create_app()
