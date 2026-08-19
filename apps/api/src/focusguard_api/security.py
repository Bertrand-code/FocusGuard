from __future__ import annotations

import base64
import hashlib
import hmac
import json
import secrets
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any

from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerifyMismatchError
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey


def random_token(length: int = 32) -> str:
    return secrets.token_urlsafe(length)


def token_digest(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def secure_equal(left: str, right: str) -> bool:
    return hmac.compare_digest(left.encode("utf-8"), right.encode("utf-8"))


class PasswordService:
    def __init__(self, pepper: str) -> None:
        self._pepper = pepper
        self._hasher = PasswordHasher(time_cost=3, memory_cost=65536, parallelism=4)

    def hash(self, password: str) -> str:
        return self._hasher.hash(password + self._pepper)

    def verify(self, password_hash: str, password: str) -> bool:
        try:
            return self._hasher.verify(password_hash, password + self._pepper)
        except (VerifyMismatchError, InvalidHashError):
            return False


def _b64url(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).rstrip(b"=").decode("ascii")


def _decode_b64url(value: str) -> bytes:
    return base64.urlsafe_b64decode(value + "=" * (-len(value) % 4))


def canonical_json(value: Any) -> bytes:
    return json.dumps(
        value,
        ensure_ascii=False,
        allow_nan=False,
        separators=(",", ":"),
        sort_keys=True,
    ).encode("utf-8")


@dataclass(frozen=True)
class PolicySigner:
    key_id: str
    private_key: Ed25519PrivateKey

    @classmethod
    def create(cls, key_id: str, encoded_seed: str | None) -> PolicySigner:
        key = (
            Ed25519PrivateKey.from_private_bytes(_decode_b64url(encoded_seed))
            if encoded_seed
            else Ed25519PrivateKey.generate()
        )
        return cls(key_id=key_id, private_key=key)

    @property
    def public_key(self) -> str:
        raw = self.private_key.public_key().public_bytes(
            encoding=serialization.Encoding.Raw,
            format=serialization.PublicFormat.Raw,
        )
        return _b64url(raw)

    def sign(self, payload: dict[str, Any]) -> dict[str, object]:
        return {
            "algorithm": "Ed25519",
            "keyId": self.key_id,
            "payload": payload,
            "signature": _b64url(self.private_key.sign(canonical_json(payload))),
        }


def isoformat(value: datetime) -> str:
    return value.astimezone(UTC).isoformat().replace("+00:00", "Z")
