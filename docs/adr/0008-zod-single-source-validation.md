# 8. zod as the single source of truth for validation

- Status: Accepted (OpenAPI drift addressed by ADR-0016) (field-level bounds added by ADR-0020)
- Date: 2026-09-24

## Context

Request validation began as hand-rolled checks, and a separate OpenAPI schema could drift from the
code that actually enforced the contract.

## Decision

Define input schemas once in zod (`strictObject`). Use them to parse the body in the handler and,
via `z.toJSONSchema`, to generate the API Gateway request model that validates at the edge.

## Consequences

- One definition drives the TypeScript type, runtime parsing, and edge rejection, with consistent
  handling of unknown fields.
- The hand-written `openapi/prefill.yaml` still duplicates the schema and can drift; generating it
  from zod is planned (Phase 2 in the review).
