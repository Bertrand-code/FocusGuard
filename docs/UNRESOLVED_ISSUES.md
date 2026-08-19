# Unresolved Issues

These are visible blockers or residual risks, not silently deferred guarantees.

- An unmanaged MV3 extension cannot prevent uninstall, disablement, alternate profiles, or other browsers.
- Trusted time is unavailable offline. The extension can detect drift from its last server anchor but cannot defeat a local administrator rolling the clock back.
- Ed25519 WebCrypto support and key-rotation behavior require testing against every minimum supported Chrome release.
- Production recovery, email verification, MFA/WebAuthn, organization invitations, and abuse-safe Level 4/5 commitments are not implemented.
- The executable PostgreSQL schema and least-privilege RLS isolation test exist, but the API still uses the explicitly development-only in-memory repository. Production startup refuses to fall back; repository wiring, pooling, transaction-local RLS claims, and credential lookup functions remain milestone work.
- Structured audit storage is defined, but API audit-event emission and a redaction review are not complete.
- The natural-language policy parser supports a narrow deterministic grammar; an external AI processor is intentionally not connected.
- Chrome integration tests still require a pinned browser test image and store-package validation.
- Telemetry and billing adapters are intentionally disabled/not implemented until the core workflow is reliable and privacy reviewed.
