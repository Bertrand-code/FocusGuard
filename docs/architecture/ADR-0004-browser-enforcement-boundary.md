# ADR-0004: Browser enforcement is a declared capability boundary

Status: accepted — 2026-08-18

## Decision

The MVP promises enforcement only inside the visibly enrolled Chrome profile. The UI and policy compiler surface unsupported scenarios. Extension-disabled, alternate-profile, other-browser, OS, and DNS coverage are health/capability states, not hidden claims.

## Alternatives

- Present extension enforcement as device-wide: commercially tempting but false and unsafe.
- Delay until native agents exist: stronger eventual coverage but blocks validation of the policy product.

## Security and privacy implications

A user can bypass an unmanaged extension. Managed Chrome can later reduce that risk. Clear scope prevents accountability partners or organizations from making decisions based on misleading compliance signals.

## Rationale

Honest partial enforcement is a sound foundation for shared policy semantics and later native clients.
