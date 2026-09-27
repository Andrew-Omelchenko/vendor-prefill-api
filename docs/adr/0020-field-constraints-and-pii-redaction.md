# 20. Field-level constraints and a PII/sensitive-data logging policy

- Status: Accepted
- Date: 2026-09-24
- Refines: ADR-0008

## Context

Inputs were validated for shape and type but not for range, and the domain carries PII (fullName)
and sensitive data (riskScore). Nothing stopped an out-of-range score, an id with unexpected
characters, or a stray log line from leaking PII.

## Decision

Add bounded, reusable field schemas (id charset + length, fullName length, riskScore as an integer
in a fixed range, source length) defined once and shared by the vendor payload, the request inputs,
the API Gateway request model, and the generated OpenAPI — so the same bounds are enforced at the
edge and in the Lambda. Adopt a logging policy: records' PII/sensitive fields must never be logged.
Enforce it as defense in depth — the logger runs every metadata object through a denylist
(`redactPii`) that masks PII and secret-ish keys, and `safeRecord()` provides a non-PII projection
for the rare case a record must appear in a log.

## Consequences

- Invalid ranges and malformed ids are rejected before any handler logic runs.
- A mistaken `logger.info('...', { fullName })` is masked rather than leaked; the denylist is shallow
  (one level), so structured record logging should still go through `safeRecord()`.
- Bounds live in one place and propagate to the contract automatically.
