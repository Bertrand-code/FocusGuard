from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient

from focusguard_api.config import Settings
from focusguard_api.main import create_app
from focusguard_api.store import InMemoryStore


@pytest.fixture
def store() -> InMemoryStore:
    return InMemoryStore()


@pytest.fixture
def client(store: InMemoryStore) -> Iterator[TestClient]:
    settings = Settings(
        environment="test",
        store="memory",
        session_cookie_secure=False,
        password_pepper="test-pepper-not-for-production",
        policy_signing_key_id="test-key",
        activity_upload_enabled=True,
    )
    with TestClient(create_app(settings, store)) as test_client:
        yield test_client
