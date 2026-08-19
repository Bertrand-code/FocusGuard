# FocusGuard

FocusGuard is a privacy-first policy and enforcement platform for digital self-control. This repository contains the first vertical slice: a shared policy engine, a minimal FastAPI control plane, and a Chrome Manifest V3 enforcement client that can continue blocking with a verified cached policy while offline.

## Repository map

- `apps/api` — FastAPI control plane and PostgreSQL migrations
- `apps/extension` — Chrome Manifest V3 enforcement client
- `apps/web` — dashboard shell (implemented in a later milestone)
- `packages/policy-engine` — deterministic, independently testable policy decisions
- `packages/schemas` — versioned wire contracts shared by TypeScript clients
- `packages/security` and `packages/telemetry` — security/privacy guardrails
- `tests/bypass-lab` — defensive tests for browser-level bypasses
- `docs` — architecture decisions and operational documentation

## Local prerequisites

- Node.js 22+
- Python 3.11+
- Docker with Compose

## Quick start

```bash
npm install
npm test
npm run typecheck

docker compose up --build
```

The API defaults to `http://localhost:8000`. Load the unpacked extension from `apps/extension/dist` after running `npm run build -w @focusguard/extension`.

The current containerized API uses the development-only in-memory repository; it is a tested vertical-slice scaffold, not a production deployment. The complete PostgreSQL schema and RLS isolation test are present, while production repository wiring is tracked as unresolved work.

This is security-sensitive software under active development. Review [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md) and [docs/UNRESOLVED_ISSUES.md](docs/UNRESOLVED_ISSUES.md) before treating it as production-ready.
