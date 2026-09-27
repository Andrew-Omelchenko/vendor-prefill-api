# 15. Factory-based dependency injection with ports and a composition root

- Status: Accepted
- Date: 2026-09-24
- Refines: ADR-0002

## Context

Modules constructed AWS clients and read configuration at import time, and the service imported
concrete adapters directly. This coupled every module to the environment, forced tests to set
`process.env` before importing (and Jest's automocker to execute that top-level code), and made
dependencies implicit. The review flagged the import-time side effects and the absence of DI.

## Decision

Invert dependencies through ports (interfaces in `src/domain/ports.ts`): `PrefillRepository`,
`VendorClient`, `SecretsProvider`, plus `Logger` and a `Clock`. Adapters and the domain service are
pure factories (`createPrefillRepository`, `createVendorClient`, `createSecretsProvider`,
`createPrefillService`) that receive their dependencies. Handlers are pure factories over a service.
The only cold-start wiring lives in `src/entry/*` (a composition root), which the CDK functions
point at; write functions compose a service with a stub vendor so they need no vendor config.
Error-to-HTTP mapping is centralized in a shared handler wrapper.

## Consequences

- Library modules have no import-time side effects; tests construct factories with plain fakes and
  need neither `jest.mock` nor `process.env`. The injected `Clock` makes timestamps deterministic.
- There are more files (ports, adapters, handlers, entry) and a small amount of wiring in the
  composition root.
- The layering matches the AWS-free-domain goal of ADR-0002 and makes adapters swappable.
