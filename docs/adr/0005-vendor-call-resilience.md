# 5. Circuit breaker and timeouts for vendor calls

- Status: Accepted
- Date: 2026-09-24

## Context

Third-party vendors (LexisNexis, Verisk, HLDI) are outside the system's control and can be slow or
fail. A synchronous call with no protection couples the service's latency and availability to
theirs.

## Decision

Wrap each vendor call in a timeout (`AbortSignal.timeout`) and a circuit breaker (`opossum`) with a
fallback that returns null. The read path then degrades to a 502 instead of hanging.

## Consequences

- A failing vendor cannot exhaust the Lambda time budget or cascade failures to callers.
- The breaker is a per-container singleton, which is harder to unit-test in isolation, and its
  timeout/threshold are currently hard-coded (noted in the review for later configurability).
