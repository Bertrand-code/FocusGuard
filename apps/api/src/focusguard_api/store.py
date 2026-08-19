from __future__ import annotations

from dataclasses import dataclass, field
from datetime import UTC, datetime
from threading import RLock
from typing import Any
from uuid import UUID, uuid4

from .security import token_digest


@dataclass
class UserRecord:
    id: UUID
    organization_id: UUID
    email: str
    password_hash: str
    time_zone: str
    policy_version: int = 1


@dataclass
class SessionRecord:
    digest: str
    user_id: UUID
    organization_id: UUID
    csrf_digest: str
    expires_at: datetime
    revoked_at: datetime | None = None


@dataclass
class EnrollmentRecord:
    digest: str
    user_id: UUID
    organization_id: UUID
    requested_name: str
    expires_at: datetime
    consumed_at: datetime | None = None


@dataclass
class DeviceRecord:
    id: UUID
    organization_id: UUID
    user_id: UUID
    name: str
    platform: str
    client_version: str
    capabilities: list[str]
    status: str = "ACTIVE"


@dataclass
class DeviceCredentialRecord:
    device_id: UUID
    access_digest: str
    access_expires_at: datetime
    refresh_digest: str
    refresh_expires_at: datetime
    family_id: UUID = field(default_factory=uuid4)
    revoked_at: datetime | None = None


@dataclass
class ProposalRecord:
    id: UUID
    user_id: UUID
    organization_id: UUID
    source_text: str
    policy: dict[str, Any]
    schedules: list[dict[str, Any]]
    warnings: list[str]
    expires_at: datetime
    confirmed_at: datetime | None = None


class InMemoryStore:
    """Test/development store. Production startup refuses this store."""

    def __init__(self) -> None:
        self._lock = RLock()
        self.users_by_id: dict[UUID, UserRecord] = {}
        self.user_id_by_email: dict[str, UUID] = {}
        self.sessions: dict[str, SessionRecord] = {}
        self.enrollments: dict[str, EnrollmentRecord] = {}
        self.devices: dict[UUID, DeviceRecord] = {}
        self.credentials_by_access: dict[str, DeviceCredentialRecord] = {}
        self.credentials_by_device: dict[UUID, DeviceCredentialRecord] = {}
        self.proposals: dict[UUID, ProposalRecord] = {}
        self.policies_by_user: dict[UUID, list[dict[str, Any]]] = {}
        self.schedules_by_user: dict[UUID, list[dict[str, Any]]] = {}
        self.events: list[dict[str, Any]] = []

    def create_user(
        self, email: str, password_hash: str, organization_name: str, time_zone: str
    ) -> UserRecord:
        del organization_name
        normalized = email.strip().lower()
        with self._lock:
            if normalized in self.user_id_by_email:
                raise ValueError("email already exists")
            record = UserRecord(uuid4(), uuid4(), normalized, password_hash, time_zone)
            self.users_by_id[record.id] = record
            self.user_id_by_email[normalized] = record.id
            return record

    def find_user_by_email(self, email: str) -> UserRecord | None:
        user_id = self.user_id_by_email.get(email.strip().lower())
        return self.users_by_id.get(user_id) if user_id else None

    def save_session(self, session: SessionRecord) -> None:
        self.sessions[session.digest] = session

    def get_session(self, raw_token: str, now: datetime) -> SessionRecord | None:
        record = self.sessions.get(token_digest(raw_token))
        if not record or record.revoked_at or record.expires_at <= now:
            return None
        return record

    def revoke_session(self, raw_token: str, now: datetime) -> None:
        record = self.sessions.get(token_digest(raw_token))
        if record:
            record.revoked_at = now

    def save_enrollment(self, enrollment: EnrollmentRecord) -> None:
        self.enrollments[enrollment.digest] = enrollment

    def consume_enrollment(self, raw_code: str, now: datetime) -> EnrollmentRecord | None:
        with self._lock:
            record = self.enrollments.get(token_digest(raw_code))
            if not record or record.consumed_at or record.expires_at <= now:
                return None
            record.consumed_at = now
            return record

    def save_device(self, device: DeviceRecord) -> None:
        self.devices[device.id] = device

    def save_device_credential(self, credential: DeviceCredentialRecord) -> None:
        old = self.credentials_by_device.get(credential.device_id)
        if old:
            old.revoked_at = datetime.now(UTC)
            self.credentials_by_access.pop(old.access_digest, None)
        self.credentials_by_access[credential.access_digest] = credential
        self.credentials_by_device[credential.device_id] = credential

    def get_device_by_access(self, raw_token: str, now: datetime) -> DeviceRecord | None:
        credential = self.credentials_by_access.get(token_digest(raw_token))
        if not credential or credential.revoked_at or credential.access_expires_at <= now:
            return None
        device = self.devices.get(credential.device_id)
        return device if device and device.status == "ACTIVE" else None

    def rotate_device_credential(
        self, device_id: UUID, raw_refresh: str, now: datetime
    ) -> DeviceCredentialRecord | None:
        credential = self.credentials_by_device.get(device_id)
        if (
            not credential
            or credential.revoked_at
            or credential.refresh_expires_at <= now
            or credential.refresh_digest != token_digest(raw_refresh)
        ):
            if credential and credential.refresh_digest != token_digest(raw_refresh):
                credential.revoked_at = now
            return None
        return credential

    def save_proposal(self, proposal: ProposalRecord) -> None:
        self.proposals[proposal.id] = proposal

    def confirm_proposal(
        self, proposal_id: UUID, user_id: UUID, organization_id: UUID, now: datetime
    ) -> tuple[UUID, int] | None:
        with self._lock:
            proposal = self.proposals.get(proposal_id)
            if (
                not proposal
                or proposal.user_id != user_id
                or proposal.organization_id != organization_id
                or proposal.expires_at <= now
                or proposal.confirmed_at
            ):
                return None
            proposal.confirmed_at = now
            self.policies_by_user.setdefault(user_id, []).append(proposal.policy)
            self.schedules_by_user.setdefault(user_id, []).extend(proposal.schedules)
            user = self.users_by_id[user_id]
            user.policy_version += 1
            return UUID(proposal.policy["id"]), user.policy_version

    def policy_material(
        self, user_id: UUID
    ) -> tuple[list[dict[str, Any]], list[dict[str, Any]], int]:
        user = self.users_by_id[user_id]
        return (
            list(self.policies_by_user.get(user_id, [])),
            list(self.schedules_by_user.get(user_id, [])),
            user.policy_version,
        )

    def save_events(self, device: DeviceRecord, events: list[dict[str, Any]]) -> None:
        for event in events:
            self.events.append(
                {
                    **event,
                    "deviceId": str(device.id),
                    "organizationId": str(device.organization_id),
                    "userId": str(device.user_id),
                }
            )
