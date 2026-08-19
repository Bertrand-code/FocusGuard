# FocusGuard Threat Model

Status: initial STRIDE review for milestone 1
Review cadence: before each enforcement capability ships and at least quarterly

## Safety and security goals

1. Only an authorized principal can view or change a tenant’s policies, devices, commitments, and events.
2. A client accepts only authentic, current policy snapshots for its own device and user.
3. Normal outages do not silently disable a still-valid cached policy.
4. FocusGuard does not collect general browsing history or page contents.
5. Commitment friction cannot strand a user without legitimate account/device recovery.
6. Product claims never exceed the capabilities of the enrolled client.

## Assets

- account and device credentials;
- policy definitions, commitments, schedules, and accountability relationships;
- signed policy snapshots and signing keys;
- minimal block-event records;
- billing/customer metadata (future milestone);
- audit records and recovery actions;
- availability of local enforcement.

## Actors

- legitimate individual, family member, organization member, and administrator;
- accountability partner with narrowly delegated approval rights;
- remote unauthenticated attacker;
- malicious tenant member;
- attacker with a stolen session or device token;
- user testing or attempting to bypass their own commitment;
- attacker with local device access;
- compromised dependency, build runner, telemetry vendor, or operator credential.

## Threats and controls

| Threat | Initial controls | Residual risk / next verification |
| --- | --- | --- |
| Account takeover | Argon2id, opaque hashed sessions, session rotation, rate limits, security notifications | Add WebAuthn/MFA and breached-password screening |
| Broken object authorization | centralized authorization context, ownership columns, forced PostgreSQL RLS, negative integration tests | RLS must be tested against a real PostgreSQL instance in CI |
| API abuse | per-IP/account/device rate limits, request size caps, bounded pagination, generic auth errors | distributed attacks require Cloudflare rules and alert tuning |
| Policy manipulation | authorization on every write, immutable revisions, audit trail, schema validation, human confirmation | admin/social-engineering risk remains |
| Extension tampering | signed snapshots, pinned keys, monotonic versions, extension store distribution | unmanaged users can disable/uninstall; cannot be cryptographically prevented |
| Replay/downgrade | subject-bound snapshot, monotonic version, validity window, server-time anchor, rotated device refresh tokens | offline clock rollback can extend perceived validity; mark degraded and constrain validity |
| Stolen device token | short-lived access token, hashed/rotating refresh token, per-device scope, revoke endpoint | local malware can act until detection/revocation |
| Privilege escalation | explicit membership roles and accountability scopes; deny by default | require systematic authorization matrix tests |
| Insecure local cache | contains enforcement data only, no access/refresh credential in sync storage, signed and versioned | browser local storage is not a secret store; do not put sensitive content in policies |
| Stripe webhook spoofing | future: raw-body verification, endpoint secret, event idempotency and ordering | billing is intentionally excluded from milestone 1 |
| Malicious URL | platform URL parser, scheme allowlist, IDNA normalization, exact label-boundary matching, no regex from users | Unicode display confusion needs UI review and test corpus |
| XSS | React escaping, no unsafe HTML, strict CSP, Trusted Types evaluation, output encoding | extension block page must stay script-free where possible |
| CSRF | SameSite cookie plus synchronizer token on every mutation; bearer device endpoints do not use cookies | login CSRF and cross-origin configuration need integration tests |
| SSRF | policy creation never fetches user URLs; egress allowlist; reject private/reserved fetch targets if a preview service is added | no URL preview service in milestone 1 |
| SQL injection | parameterized SQL/ORM only, no user-selected column/order fragments | add SAST and integration fuzz cases |
| Secrets exposure | secret manager, log redaction, no credentials in URLs, pre-commit/CI secret scan | developer endpoints and crash dumps require continued review |
| Dependency compromise | lockfiles, pinned images/actions, Dependabot/Renovate, OSV audit, provenance/SBOM later | package-manager install scripts remain a risk; minimize dependencies |
| Telemetry leakage | allowlisted event schema, URL sanitizer, no request bodies/auth headers, vendor adapters default off | audit Sentry breadcrumbs and reverse-proxy logs before production |
| Unsafe lockout | commitment preview, bounded duration, clock-independent server recovery, emergency access with delay/notification/audit | any recovery can become a bypass; monitor and make consequences visible |

## Commitment abuse cases

- Accidental broad rule blocks authentication, payment, medical, accessibility, or emergency resources.
- An abusive partner or compromised admin creates a lock that the device owner cannot understand or recover from.
- A user selects a long lock while distressed and later needs essential access.
- “Emergency recovery” becomes a hidden ordinary bypass.

Controls: protected recovery domains, plain-language impact preview, maximum initial commitment duration, cooling-off before the first high-level lock activates, explicit device owner acknowledgement, narrowly scoped emergency recovery, strong reauthentication when available, delay where safe, prominent notification, and immutable audit. Emergency access restores account/device access; it does not silently erase the policy. Organization-managed enforcement must display the managing organization and an appeal/contact path.

## Logging prohibitions

Never log or send: passwords, session/device/refresh tokens, cookies, authorization headers, page content, page titles, query strings, fragments, form fields, keystrokes, screenshots, or non-policy browsing. Sensitive fields are denylisted at logging boundaries in addition to allowlisted event construction.

## Validation plan

- unit tests for normalization, precedence, schedules, expiry, and snapshot verification;
- API authorization tests with two tenants and cross-tenant identifiers;
- PostgreSQL RLS tests using the least-privilege application role;
- replay/rotation tests for enrollment and device credentials;
- CSP/header tests and dependency/SAST/secret scans in CI;
- defensive `bypass-lab` cases for redirects, encoding, subdomains, ports, IPs, offline state, and clock drift;
- manual Chrome tests for incognito, disable/uninstall visibility, alternate profiles, and browser restart.
