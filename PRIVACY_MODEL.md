# FocusGuard Privacy Model

## Principles

FocusGuard processes locally whenever the decision can be made locally. The service stores user intent and enforcement outcomes, not a reconstruction of browsing behavior. Monitoring is visible and consensual; managed deployments name the managing organization and provide a contact/recovery route.

## Data inventory

| Data | Purpose | Default location | Default retention |
| --- | --- | --- | --- |
| Account email and password hash | authentication and recovery | server | account lifetime, then deletion workflow |
| Organization membership | authorization | server | membership/account lifetime |
| Device name, type, capabilities, last seen | enrollment and health | server | device lifetime + 30 days |
| Policies, rules, schedules, commitments | requested enforcement | server and verified local cache | until deleted; revisions retained 90 days for audit |
| Device credentials | device authentication | token digest on server; token locally | access: 15 minutes; rotating refresh: 30 days max |
| Block event | explain enforcement and optional activity summary | bounded local queue and server | off by default for individuals; 30 days when enabled |
| Audit event | security-sensitive change accountability | server | 365 days, configurable by tenant/legal need |
| Diagnostic event | reliability/security | Sentry or first-party store after scrubbing | 14 days by default |

## Policy-relevant block event

Allowed fields:

- random event ID;
- organization, user, and device IDs;
- policy and rule IDs;
- decision enum and reason code;
- matched normalized registrable/domain label only when the user explicitly configured that domain;
- client-generated coarse timestamp (minute precision) and server receipt timestamp;
- policy snapshot version and client version.

Forbidden fields include the full URL, path, query, fragment, page title/content, referrer, tab history, DOM, form values, and nearby allowed browsing. No “heartbeat” contains current site information.

## Local data

The extension stores a signed policy snapshot, its verification metadata, device identity, credential material, a server-time anchor, health status, and a small retry queue of allowlisted policy events. It does not use Chrome sync storage. Local storage is not described as confidential against local malware or a device administrator.

## User controls

- event collection is off by default for individual accounts;
- the UI previews exactly what a policy will match and what activity fields, if any, will be retained;
- users can inspect devices, active policy version, last synchronization, health, and audit history;
- export and deletion workflows cover account, policy, device, and activity data;
- an organization cannot covertly enroll a personal device; the extension shows enrollment state and organization identity.

## Telemetry boundary

PostHog receives coarse product interaction names and random installation/tenant pseudonyms only after consent and configuration. Sentry receives scrubbed error class, component, version, and stack trace. Both adapters are disabled until configured. URLs, request bodies, headers, policy text, domain lists, and account identifiers are removed before SDK invocation.

## AI policy creation

Natural-language input is sensitive intent data. The first implementation uses deterministic local/server parsing for supported phrases. If an external model is later introduced, confirmation must disclose the processor; inputs must be minimized, excluded from training where contractually supported, and deleted under a defined short retention. Model output is untrusted: it becomes a proposal, passes schema and capability validation, is previewed, and requires human confirmation before persistence.
