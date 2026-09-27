# 14. Validated runtime configuration module

- Status: Accepted
- Date: 2026-09-24
- Refines: ADR-0007

## Context

Runtime modules read `process.env` directly with `as string` casts spread across several files. A
missing or malformed variable surfaced only as a cryptic failure deep in a request (for example a
DynamoDB call with `TableName: undefined`), and configuration was scattered rather than described in
one place. ADR-0007 noted this as a known weakness.

## Decision

Introduce `src/lib/runtime-config.ts`: zod schemas for the runtime environment variables, grouped by
concern (database, vendor, auth, secrets, observability), each parsed once and memoized. Consumers
import a typed, validated accessor instead of reading `process.env`. Invalid or missing values throw
a clear, labelled error. Numeric and enum values are coerced and defaulted in the schema. The vendor
slice is parsed lazily (on the first vendor call) so functions that import the shared service but do
not call the vendor need not carry vendor configuration.

## Consequences

- One place describes runtime configuration; failures are clear and early rather than cryptic and
  late; no `as string` casts remain.
- Circuit-breaker tuning now flows through this module from per-environment config, and the metric
  name is shared with the infrastructure via a single constants module, removing the drift risk
  noted in ADR-0010.
- Config parsing is memoized, so tests that need to vary environment must reset modules between
  cases.
