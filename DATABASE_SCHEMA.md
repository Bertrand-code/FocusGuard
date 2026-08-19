# FocusGuard Database Schema

PostgreSQL is the system of record. UUIDv7 is preferred for new identifiers when the runtime supports it; database defaults use random UUIDs initially. All timestamps are `timestamptz`. Mutable rows include `created_at`, `updated_at`, and an optimistic `version` where concurrent edits matter.

## Ownership model

- A user may belong to multiple organizations through `organization_memberships`.
- Every tenant-owned row includes a non-null `organization_id`.
- User-specific rows also include `user_id`; device/policy references never substitute for ownership columns.
- The API starts every tenant transaction by setting `app.user_id`, `app.organization_id`, and `app.role` locally. Forced RLS denies rows when claims are absent.
- Background jobs assume a distinct, audited database role and process one explicit organization at a time.

## Principal tables

| Table | Important fields |
| --- | --- |
| `users` | `id`, normalized `email`, `password_hash`, `status`, `verified_at` |
| `organizations` | `id`, `name`, `kind` (individual/family/organization), `status` |
| `organization_memberships` | `id`, `organization_id`, `user_id`, `role`, `status` |
| `devices` | `id`, `organization_id`, `user_id`, name, platform, client type/version, capability JSON, status, last seen |
| `policies` | `id`, `organization_id`, `user_id`, name, enabled, priority, current revision, validity, fail mode |
| `policy_rules` | `id`, ownership, `policy_id`, priority, decision, condition JSON, override JSON, reason |
| `categories` | `id`, ownership (nullable only for curated global records), name, version |
| `domains` | `id`, ownership, normalized ASCII domain, category, source, confidence |
| `schedules` | `id`, ownership, name, IANA timezone, weekly windows JSON, validity |
| `focus_sessions` | `id`, ownership, policy, starts/ends, state, completed time |
| `block_events` | `id`, ownership, device/policy/rule, decision, reason code, configured matched domain, coarse occurred time, snapshot version |
| `override_requests` | `id`, ownership, policy/rule/device, level, reason, state, requested/available/decided/expiry times, decision actor |
| `commitments` | `id`, ownership, policy, level, starts/ends, minimum decision, state, recovery policy JSON |
| `accountability_partners` | `id`, ownership, user, partner user/email, scoped permissions, status |
| `subscriptions` | `id`, ownership, provider customer/subscription IDs, state, plan, period end |
| `device_health` | `id`, ownership, device, observed time, policy version, sync state, enforcement state, clock drift bucket, client version |

## Security support tables

- `user_sessions`: session digest, user, organization, CSRF digest, expiry, revocation and rotation metadata.
- `device_enrollment_codes`: digest, ownership, expiry, attempts, consumed time.
- `device_credentials`: access/refresh digests, device, family, expiry, rotation/reuse fields.
- `policy_revisions`: immutable validated snapshot source and actor.
- `audit_events`: actor type/id, organization, action, target type/id, result, request ID, allowlisted metadata, timestamp.
- `webhook_events` (future): provider event ID, type, received/processed status and retry metadata; no raw secret-bearing headers.

## Constraints and indexes

- case-insensitive unique user email; unique active membership per organization/user;
- normalized domain is lowercase ASCII without a trailing dot and has a length constraint;
- `CHECK (ends_at > starts_at)` for sessions/commitments and bounded enrollment/session expiries;
- unique monotonic `(policy_id, revision)` and `(device_id, snapshot_version)` where stored;
- indexes on all ownership and foreign-key columns;
- block events partitioned by receipt month once volume warrants it; retention deletes entire partitions;
- delete behavior is explicit: security/audit records restrict or tombstone, ephemeral credentials cascade with device, policy history is retained per policy.

The executable first migration is in `apps/api/migrations/0001_initial.sql` and contains the concrete RLS policies.
