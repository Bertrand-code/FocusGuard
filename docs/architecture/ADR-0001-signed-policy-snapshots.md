# ADR-0001: Signed policy snapshots

Status: accepted — 2026-08-18

## Decision

The API compiles a device-subject-bound, versioned snapshot and signs canonical JSON with Ed25519. Clients pin key IDs and accept only valid signatures, their own subject, increasing versions, supported schema versions, and bounded validity.

## Alternatives

- TLS only: simpler, but cached state can be locally replaced or downgraded.
- Shared-key HMAC: easy, but every client would contain a signing secret and could forge policies.
- Online evaluation: centralizes logic, but discloses more navigation data and fails offline.

## Security and privacy implications

Asymmetric signatures limit signing authority to the service and allow local verification without sending navigations. Signatures do not make local storage confidential or stop extension removal. Key rotation needs overlapping pinned public keys and an emergency revocation release.

## Rationale

This gives offline integrity and data minimization while keeping the signing key out of clients.
