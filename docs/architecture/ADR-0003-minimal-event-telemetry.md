# ADR-0003: Policy events are not browsing history

Status: accepted — 2026-08-18

## Decision

Clients emit only allowlisted events for decisions relevant to an enabled policy. Full URLs, paths, query strings, fragments, titles, content, form values, referrers, and allowed navigation are prohibited. Individual-account event upload is off by default.

## Alternatives

- Full history: makes analytics easy but violates the product’s purpose and creates unacceptable breach/abuse risk.
- No event collection: maximizes privacy but prevents optional accountability and security health evidence.

## Security and privacy implications

Even a configured matched domain is sensitive. Retention is short, access is tenant-scoped, and telemetry adapters cannot accept arbitrary properties. Server/proxy/Sentry URL capture must be separately disabled and tested.

## Rationale

Users may opt into narrowly useful accountability without becoming the subject of a general surveillance system.
