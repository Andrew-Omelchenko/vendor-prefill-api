# 12. Edge authentication via a JWT Lambda authorizer

- Status: Accepted (made configurable by ADR-0023)
- Date: 2026-09-24

## Context

The API Gateway was unauthenticated. Even with ApigeeX in front, the raw API Gateway URL was
reachable and bypassed it — a critical gap identified in the review.

## Decision

A Lambda TOKEN authorizer validates the bearer JWT (signature via the IdP's JWKS, plus issuer,
audience, and expiry) and is applied to every method through `defaultMethodOptions`. Stage
throttling is always on; production adds a WAF web ACL (AWS managed rules plus a per-IP rate limit).

## Consequences

- Real token validation at the AWS edge; requiring a valid token also closes the bypass hole; this
  is defense in depth alongside ApigeeX.
- The authorizer needs a real IdP (issuer/audience/JWKS) configured before the API is usable; each
  request incurs a small authorizer invocation, mitigated by result caching.
