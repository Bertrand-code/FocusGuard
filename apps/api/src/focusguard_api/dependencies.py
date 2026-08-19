from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Annotated, cast

from fastapi import Depends, Header, HTTPException, Request, status

from .security import secure_equal, token_digest
from .store import DeviceRecord, InMemoryStore, SessionRecord


@dataclass(frozen=True)
class SessionContext:
    session: SessionRecord

    @property
    def user_id(self):  # type: ignore[no-untyped-def]
        return self.session.user_id

    @property
    def organization_id(self):  # type: ignore[no-untyped-def]
        return self.session.organization_id


def get_store(request: Request) -> InMemoryStore:
    return cast(InMemoryStore, request.app.state.store)


async def require_session(
    request: Request,
    store: Annotated[InMemoryStore, Depends(get_store)],
) -> SessionContext:
    cookie_name = request.app.state.settings.session_cookie_name
    raw_session = request.cookies.get(cookie_name)
    session = store.get_session(raw_session, datetime.now(UTC)) if raw_session else None
    if not session:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Authentication required")
    return SessionContext(session)


async def require_csrf_session(
    session: Annotated[SessionContext, Depends(require_session)],
    x_csrf_token: Annotated[str | None, Header()] = None,
) -> SessionContext:
    if not x_csrf_token or not secure_equal(
        token_digest(x_csrf_token), session.session.csrf_digest
    ):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "CSRF validation failed")
    return session


async def require_device(
    authorization: Annotated[str | None, Header()],
    store: Annotated[InMemoryStore, Depends(get_store)],
) -> DeviceRecord:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Device authentication required")
    token = authorization.removeprefix("Bearer ").strip()
    device = store.get_device_by_access(token, datetime.now(UTC))
    if not device:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Device credential invalid or expired")
    return device
