# FocusGuard Implementation Plan

## Definition of done for every milestone

- tests, lint, type checking, and applicable security scans pass;
- tenant-isolation and privacy-negative tests are included;
- architecture decisions and unresolved risks are updated;
- the product does not claim enforcement beyond client capability;
- a working, reviewable commit is created.

## Milestone 0 — foundation (this repository baseline)

- architecture, threat model, database schema, privacy model, and ADRs;
- npm/Python monorepo and reproducible containers;
- shared policy contracts and pure policy engine;
- database migration with RLS design;
- API health/auth/device-policy skeleton;
- offline MV3 extension skeleton and local block screen;
- CI checks and initial defensive bypass lab.

Exit: deterministic policy-engine tests pass; API auth tests pass without logging secrets; extension builds; bypass report is generated.

## Milestone 1 — first end-to-end blocking workflow

1. Dashboard signup/login with accessible session and CSRF flow.
2. Visible Chrome-profile enrollment with one-time code.
3. “Block Reddit during work hours” parser returning a structured proposal.
4. Schema/capability validation and explicit human confirmation.
5. Immutable policy revision, signed snapshot, synchronization, and verified cache.
6. Navigation to Reddit during the schedule produces the local block screen.
7. Offline and restart behavior passes browser integration tests.

## Milestone 2 — safe overrides and commitments

- Level 1–3 overrides first; Level 4 partner approval after notification/recovery review; Level 5 only after an abuse/safety design review;
- essential-access allowlist, preview, cooling-off, bounded first lock, recovery audit and notification;
- focus sessions and device-health UI.

## Milestone 3 — product hardening

- MFA/WebAuthn, email verification and recovery;
- real PostgreSQL RLS integration suite, Redis distributed limits, key rotation drill;
- Chrome Web Store packaging, tamper/health messaging, accessibility and localization;
- retention/deletion/export jobs and telemetry privacy audit;
- external penetration test and incident-response exercise.

## Milestone 4 — dashboard breadth and billing

Devices, Policies, Focus, Commitments, Accountability, Activity, Subscription, and Settings receive production UX. Stripe is added only after the blocking workflow and recovery controls are reliable. Webhooks use raw-body signature verification, idempotent event processing, and server-side entitlement calculation.

## Future enforcement clients

Add managed Chrome, DNS, macOS, Windows, Android, and iOS clients individually. Each requires a capability matrix, platform threat model, policy-engine conformance fixtures, transparent installation/health UI, and platform-appropriate recovery design.
