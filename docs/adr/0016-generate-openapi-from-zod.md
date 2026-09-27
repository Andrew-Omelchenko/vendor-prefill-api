# 16. Generate the OpenAPI spec from the zod schemas

- Status: Accepted
- Date: 2026-09-24
- Refines: ADR-0008

## Context

The OpenAPI file was maintained by hand while zod was the enforced source of truth, so the two
could drift. ADR-0008 noted this.

## Decision

Generate `openapi/prefill.json` from the zod schemas with a script (`scripts/generate-openapi.ts`,
`npm run openapi:generate`) that converts the entity and input schemas via `z.toJSONSchema` and
assembles the paths and responses. A CI check (`npm run openapi:check`) regenerates and fails the
build if the committed file is stale, so the spec cannot drift from the code.

## Consequences

- The request/response schemas have a single source; the hand-written YAML is removed.
- The paths and response descriptions still live in the generator (zod describes shapes, not
  routes), so they are declared once there rather than derived.
- The generated JSON is excluded from Prettier and regenerated via the script.
