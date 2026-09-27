# 9. Optimistic concurrency via conditional writes

- Status: Accepted
- Date: 2026-09-24

## Context

Concurrent writers could lose updates or create duplicates with a naive read-then-write.

## Decision

Creates use `attribute_not_exists(pk)` (create-only). Updates and deletes are conditional on the
record existing and, when an `If-Match` version is supplied, on that version, which is atomically
incremented. `ReturnValuesOnConditionCheckFailure` distinguishes "not found" (404) from
"version conflict" (412) in a single write.

## Consequences

- No lost updates or duplicate creates; one atomic conditional write instead of a racy
  read-then-write.
- Clients must read first and send `If-Match` (a missing header yields 428); handlers are slightly
  more involved.
