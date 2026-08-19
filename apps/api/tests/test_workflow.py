from __future__ import annotations

import base64
from typing import Any

import pytest
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey
from fastapi.testclient import TestClient

from focusguard_api.config import Settings
from focusguard_api.main import create_app
from focusguard_api.security import canonical_json
from focusguard_api.store import InMemoryStore


def signup(client: TestClient, email: str = "owner@example.com") -> dict[str, Any]:
    response = client.post(
        "/v1/auth/signup",
        json={
            "email": email,
            "password": "correct horse battery staple",
            "organizationName": "Personal",
            "timeZone": "America/Los_Angeles",
        },
    )
    assert response.status_code == 201
    return response.json()


def enroll_device(client: TestClient, csrf: str) -> dict[str, Any]:
    enrollment = client.post(
        "/v1/devices/enrollments",
        json={"name": "My Chrome"},
        headers={"X-CSRF-Token": csrf},
    )
    assert enrollment.status_code == 201
    activation = client.post(
        "/v1/devices/activate",
        json={
            "enrollmentCode": enrollment.json()["enrollmentCode"],
            "name": "My Chrome",
            "platform": "chrome-extension",
            "clientVersion": "0.1.0",
            "capabilities": ["navigation", "offline-policy"],
        },
    )
    assert activation.status_code == 201
    return activation.json()


def decode(value: str) -> bytes:
    return base64.urlsafe_b64decode(value + "=" * (-len(value) % 4))


def test_security_headers_are_applied(client: TestClient) -> None:
    response = client.get("/healthz")
    assert response.status_code == 200
    assert (
        response.headers["content-security-policy"] == "default-src 'none'; frame-ancestors 'none'"
    )
    assert response.headers["x-content-type-options"] == "nosniff"
    assert response.headers["cache-control"] == "no-store"


def test_postgres_mode_never_silently_falls_back_to_memory() -> None:
    settings = Settings(
        environment="test",
        store="postgres",
        session_cookie_secure=False,
    )
    with pytest.raises(RuntimeError, match="PostgreSQL repository is not implemented"):
        with TestClient(create_app(settings)):
            pass


def test_signup_uses_opaque_cookie_and_generic_duplicate_error(client: TestClient) -> None:
    first = signup(client)
    cookie = client.cookies.get("focusguard_session")
    assert cookie and first["csrfToken"] not in cookie
    duplicate = client.post(
        "/v1/auth/signup",
        json={
            "email": "OWNER@example.com",
            "password": "another long secure password",
            "organizationName": "Other",
            "timeZone": "UTC",
        },
    )
    assert duplicate.status_code == 409
    assert duplicate.json()["detail"] == "Account cannot be created"


def test_cookie_mutation_requires_csrf(client: TestClient) -> None:
    signup(client)
    response = client.post("/v1/devices/enrollments", json={"name": "Chrome"})
    assert response.status_code == 403


def test_enrollment_code_is_one_time(client: TestClient) -> None:
    auth = signup(client)
    enrollment = client.post(
        "/v1/devices/enrollments",
        json={"name": "Chrome"},
        headers={"X-CSRF-Token": auth["csrfToken"]},
    ).json()
    request = {
        "enrollmentCode": enrollment["enrollmentCode"],
        "name": "Chrome",
        "platform": "chrome-extension",
        "clientVersion": "0.1.0",
        "capabilities": ["navigation"],
    }
    assert client.post("/v1/devices/activate", json=request).status_code == 201
    assert client.post("/v1/devices/activate", json=request).status_code == 401


def test_proposal_requires_human_confirmation_before_snapshot(client: TestClient) -> None:
    auth = signup(client)
    device = enroll_device(client, auth["csrfToken"])
    headers = {"Authorization": f"Bearer {device['accessToken']}"}

    before = client.get("/v1/device/policy-snapshot", headers=headers).json()
    assert before["payload"]["policies"] == []

    proposal = client.post(
        "/v1/policies/proposals",
        json={"text": "Block Reddit during work hours", "timeZone": "America/Los_Angeles"},
        headers={"X-CSRF-Token": auth["csrfToken"]},
    )
    assert proposal.status_code == 201
    assert proposal.json()["requiresConfirmation"] is True

    still_before = client.get("/v1/device/policy-snapshot", headers=headers).json()
    assert still_before["payload"]["policies"] == []

    confirmed = client.post(
        "/v1/policies",
        json={"proposalId": proposal.json()["proposalId"], "confirmation": "CONFIRM"},
        headers={"X-CSRF-Token": auth["csrfToken"]},
    )
    assert confirmed.status_code == 201
    after = client.get("/v1/device/policy-snapshot", headers=headers).json()
    assert after["payload"]["policies"][0]["rules"][0]["conditions"]["domains"] == ["reddit.com"]
    assert after["payload"]["snapshotVersion"] == confirmed.json()["snapshotVersion"]


def test_snapshot_signature_and_subject_are_valid(client: TestClient) -> None:
    auth = signup(client)
    device = enroll_device(client, auth["csrfToken"])
    snapshot = client.get(
        "/v1/device/policy-snapshot",
        headers={"Authorization": f"Bearer {device['accessToken']}"},
    ).json()
    public_key = Ed25519PublicKey.from_public_bytes(decode(device["signingPublicKey"]))
    public_key.verify(decode(snapshot["signature"]), canonical_json(snapshot["payload"]))
    assert snapshot["payload"]["deviceId"] == device["deviceId"]
    assert snapshot["payload"]["organizationId"] == auth["organizationId"]


def test_refresh_replay_revokes_replacement_credential(client: TestClient) -> None:
    auth = signup(client)
    device = enroll_device(client, auth["csrfToken"])
    refresh_body = {"deviceId": device["deviceId"], "refreshToken": device["refreshToken"]}
    replacement = client.post("/v1/devices/refresh", json=refresh_body)
    assert replacement.status_code == 200
    replay = client.post("/v1/devices/refresh", json=refresh_body)
    assert replay.status_code == 401
    new_access = replacement.json()["accessToken"]
    assert (
        client.get(
            "/v1/device/policy-snapshot", headers={"Authorization": f"Bearer {new_access}"}
        ).status_code
        == 401
    )


def test_cross_tenant_proposal_confirmation_is_denied(client: TestClient) -> None:
    first = signup(client, "first@example.com")
    proposal = client.post(
        "/v1/policies/proposals",
        json={"text": "Block Reddit during work hours", "timeZone": "UTC"},
        headers={"X-CSRF-Token": first["csrfToken"]},
    ).json()

    client.cookies.clear()
    second = signup(client, "second@example.com")
    response = client.post(
        "/v1/policies",
        json={"proposalId": proposal["proposalId"], "confirmation": "CONFIRM"},
        headers={"X-CSRF-Token": second["csrfToken"]},
    )
    assert response.status_code == 409


def test_event_schema_rejects_full_urls(client: TestClient, store: InMemoryStore) -> None:
    auth = signup(client)
    device = enroll_device(client, auth["csrfToken"])
    response = client.post(
        "/v1/device/block-events",
        headers={"Authorization": f"Bearer {device['accessToken']}"},
        json={
            "events": [
                {
                    "eventId": "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
                    "policyId": "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
                    "ruleId": "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
                    "decision": "BLOCK",
                    "reasonCode": "RULE_MATCH",
                    "matchedConfiguredDomain": "reddit.com/r/private?secret=yes",
                    "occurredAt": "2026-08-18T19:00:00Z",
                    "snapshotVersion": 2,
                    "clientVersion": "0.1.0",
                }
            ]
        },
    )
    assert response.status_code == 422
    assert store.events == []


def test_lunch_exception_compiles_to_two_windows(client: TestClient) -> None:
    auth = signup(client)
    response = client.post(
        "/v1/policies/proposals",
        json={
            "text": (
                "Block Reddit, Instagram and YouTube Monday through Friday "
                "from 9 AM until 5 PM, except during lunch"
            ),
            "timeZone": "America/Los_Angeles",
        },
        headers={"X-CSRF-Token": auth["csrfToken"]},
    )
    assert response.status_code == 201
    assert response.json()["schedules"][0]["windows"] == [
        {"days": [1, 2, 3, 4, 5], "start": "09:00", "end": "12:00"},
        {"days": [1, 2, 3, 4, 5], "start": "13:00", "end": "17:00"},
    ]
    assert sorted(response.json()["policy"]["rules"][0]["conditions"]["domains"]) == [
        "instagram.com",
        "reddit.com",
        "youtube.com",
    ]
