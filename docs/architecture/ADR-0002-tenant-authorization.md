# ADR-0002: Application authorization plus forced RLS

Status: accepted — 2026-08-18

## Decision

Every request builds an explicit authorization context. Services enforce action/role/ownership rules, and PostgreSQL forced Row-Level Security independently constrains tenant rows using transaction-local claims.

## Alternatives

- Application checks only: portable but a missed filter becomes cross-tenant exposure.
- RLS only: strong row filtering but insufficient for action semantics and easy to misuse without transaction discipline.
- Schema/database per tenant: strong separation but high operational cost for individuals and families.

## Security and privacy implications

Defense in depth sharply reduces broken-object authorization risk. Connection-pool claim leakage is dangerous, so claims must use `SET LOCAL` inside a transaction and tests must prove empty/cross-tenant contexts see no rows.

## Rationale

Shared-schema multitenancy fits the product scale while maintaining an enforceable database boundary.
