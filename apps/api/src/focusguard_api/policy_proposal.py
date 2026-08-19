from __future__ import annotations

import re
from datetime import UTC, datetime, timedelta
from typing import Any
from uuid import UUID, uuid4
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

KNOWN_TARGETS = {
    "reddit": "reddit.com",
    "instagram": "instagram.com",
    "youtube": "youtube.com",
}


class UnsupportedProposal(ValueError):
    pass


def _active_targets(text: str) -> list[str]:
    lowered = text.casefold()
    return [domain for name, domain in KNOWN_TARGETS.items() if re.search(rf"\b{name}\b", lowered)]


def _windows(text: str) -> list[dict[str, Any]]:
    lowered = text.casefold()
    if "work hours" in lowered:
        if "lunch" in lowered:
            return [
                {"days": [1, 2, 3, 4, 5], "start": "09:00", "end": "12:00"},
                {"days": [1, 2, 3, 4, 5], "start": "13:00", "end": "17:00"},
            ]
        return [{"days": [1, 2, 3, 4, 5], "start": "09:00", "end": "17:00"}]

    match = re.search(
        r"(?:from\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)\s+(?:until|to|-)\s+"
        r"(\d{1,2})(?::(\d{2}))?\s*(am|pm)",
        lowered,
    )
    if not match:
        raise UnsupportedProposal("Add 'during work hours' or a supported start and end time.")

    def to_24_hour(hour: str, minute: str | None, suffix: str) -> str:
        numeric_hour = int(hour) % 12 + (12 if suffix == "pm" else 0)
        return f"{numeric_hour:02d}:{int(minute or '0'):02d}"

    days = [1, 2, 3, 4, 5] if "monday" in lowered or "weekday" in lowered else list(range(7))
    start = to_24_hour(match.group(1), match.group(2), match.group(3))
    end = to_24_hour(match.group(4), match.group(5), match.group(6))
    if "lunch" in lowered and start < "12:00" and end > "13:00":
        return [
            {"days": days, "start": start, "end": "12:00"},
            {"days": days, "start": "13:00", "end": end},
        ]
    return [{"days": days, "start": start, "end": end}]


def build_proposal(
    text: str,
    time_zone: str,
    organization_id: UUID,
    user_id: UUID,
    now: datetime,
) -> dict[str, Any]:
    if not re.search(r"\b(block|limit|warn)\b", text, re.IGNORECASE):
        raise UnsupportedProposal(
            "Use an explicit action such as 'Block Reddit during work hours'."
        )
    targets = _active_targets(text)
    if not targets:
        raise UnsupportedProposal(
            "No supported target was recognized. Try Reddit, Instagram, or YouTube."
        )
    try:
        ZoneInfo(time_zone)
    except ZoneInfoNotFoundError as exc:
        raise UnsupportedProposal("Use a valid IANA timezone such as America/Los_Angeles.") from exc

    schedule_id = uuid4()
    policy_id = uuid4()
    rule_id = uuid4()
    schedule = {
        "id": str(schedule_id),
        "organizationId": str(organization_id),
        "userId": str(user_id),
        "name": "Work hours",
        "timeZone": time_zone,
        "windows": _windows(text),
        "validFrom": None,
        "validUntil": None,
    }
    policy = {
        "id": str(policy_id),
        "organizationId": str(organization_id),
        "userId": str(user_id),
        "name": "Work distractions",
        "enabled": True,
        "priority": 0,
        "validFrom": None,
        "validUntil": None,
        "rules": [
            {
                "id": str(rule_id),
                "policyId": str(policy_id),
                "priority": 0,
                "enabled": True,
                "decision": "BLOCK",
                "conditions": {
                    "domains": targets,
                    "categories": [],
                    "applications": [],
                    "deviceIds": [],
                    "scheduleIds": [str(schedule_id)],
                    "focusSessionRequired": False,
                },
                "reason": "Blocked during the work schedule you confirmed.",
                "expiresAt": None,
                "override": {
                    "available": True,
                    "level": 2,
                    "cooldownSeconds": 0,
                    "reasonRequired": True,
                    "partnerApprovalRequired": False,
                },
            }
        ],
    }
    warnings = ["Work hours default to Monday–Friday, 9:00 AM–5:00 PM in your selected timezone."]
    if "lunch" in text.casefold():
        warnings = ["Lunch is interpreted as 12:00 PM–1:00 PM in your selected timezone."]
    expires_at = now.astimezone(UTC) + timedelta(minutes=30)
    return {
        "proposalId": str(uuid4()),
        "sourceText": text,
        "policy": policy,
        "schedules": [schedule],
        "warnings": warnings,
        "requiresConfirmation": True,
        "expiresAt": expires_at,
    }
