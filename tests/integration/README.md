# Integration tests

The Python workflow suite covers signup, CSRF, one-time enrollment, credential rotation/replay, proposal confirmation, snapshot signing, tenant isolation, and event privacy. Browser-driven Chrome tests are a milestone-1 hardening item because they require a pinned Chrome image; the defensive cases and manual gaps are reported by `tests/bypass-lab`.
