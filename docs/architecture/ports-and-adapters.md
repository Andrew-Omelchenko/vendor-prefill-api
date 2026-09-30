# Ports and adapters (hexagonal architecture)

The codebase separates business logic from infrastructure using **ports** (interfaces the
domain owns) and **adapters** (concrete implementations of those interfaces), wired together by
a **composition root**. Delivery code (HTTP handlers) and infrastructure code (DynamoDB, the
vendor HTTP client, Secrets Manager) both depend inward on the domain; the domain depends on
neither. This is the ports-and-adapters, or hexagonal, style, and it is an application of the
Dependency Inversion Principle.

![Ports and adapters: handlers and adapters both depend inward on the domain.](ports-and-adapters.svg)

## The shape

The dependency arrows all point toward the centre:

```
handlers ──▶ service ──▶ ports ◀── adapters
             └────── domain ──────┘
```

- **Handlers depend on the service.** They translate an HTTP event into a domain call and the
  result back into an HTTP response; they hold no business rules.
- **The service depends only on ports.** It calls `repository.getCached(...)`,
  `vendor.getVendorRecord(...)`, and so on — interfaces — and has no knowledge that DynamoDB or
  `fetch` exist.
- **Adapters depend on the ports they implement.** DynamoDB, the vendor HTTP call (real and
  fake), and Secrets Manager live here, behind the same interfaces the service consumes.

Note the direction: the domain does not depend on infrastructure. Infrastructure depends on the
domain's interfaces. That inversion is the whole point.

## Where each layer lives

- **Domain — `src/domain/`.** `ports.ts` (the interfaces), `prefill-service.ts` (the business
  logic, written as a factory over those interfaces), plus `schemas.ts`, `validation.ts`, and
  `errors.ts`. Contains no AWS SDK import.
- **Delivery / driving adapters — `src/handlers/`.** Pure handler factories
  (`get`/`post`/`put`/`delete-prefill.ts`) and `handler-wrapper.ts`, which centralises the
  mapping of domain errors to HTTP responses.
- **Infrastructure / driven adapters — `src/clients/` and `src/lib/`.** `prefill-repository.ts`
  (DynamoDB), `vendor-client.ts` and `fake-vendor-client.ts`, and `secrets.ts`. This is the only
  place the AWS SDK, `fetch`, and `opossum` appear.
- **Composition root — `src/entry/`.** `composition.ts` and the per-function entry files are the
  single place that constructs the concrete adapters and injects them into the service at cold
  start. The CDK functions target these entry files.

## The ports

Defined in `src/domain/ports.ts`:

- `PrefillRepository` — read/write of prefill records (implemented over DynamoDB).
- `VendorClient` — fetch a record from the external vendor (implemented as a real HTTP client
  behind a circuit breaker, or as an in-process fake).
- `SecretsProvider` — resolve a named secret (implemented over Secrets Manager, with caching).
- `Logger` — structured logging with a `child()` binding.
- `Clock` — the current time, so timestamps are deterministic under test.

## Why this was chosen

- **Testability without mocking the world.** Because the service receives interfaces, unit tests
  construct it with plain fakes — no module mocking, no AWS SDK stubbing, no environment setup.
  This is the most concrete payoff and the reason the unit suite is small and fast.
- **Swappable infrastructure, used in practice.** The real vendor client and the fake vendor
  client implement the same `VendorClient` port; the composition root selects one from
  configuration. The same seam supports switching authentication strategies. Multiple
  implementations were shipped behind single ports without touching the logic.
- **A pure, stable domain.** Business rules do not churn when infrastructure changes. Replacing a
  data store or vendor transport touches one adapter, not the service.
- **Clear boundaries and reviewability.** Infrastructure concerns are confined to the adapter
  files; anyone reviewing the code knows exactly where AWS lives and where the rules live.
- **No import-time side effects.** Clients and configuration are created inside the composition
  root at cold start, not as a side effect of importing a module — which also keeps tests free of
  hidden setup.

## Trade-offs

- **More files and indirection.** A single call path passes through a handler, the service, a
  port, and an adapter. For a trivial CRUD endpoint this can be more structure than the problem
  needs.
- **Discipline required.** The benefit holds only while AWS types do not leak through the ports;
  an interface that exposes a DynamoDB type would defeat the separation.
- **A learning curve.** The indirection is unfamiliar to newcomers until the direction of
  dependencies clicks — which is part of why this document exists.

## When it pays off

The pattern earns its cost when the logic is non-trivial, a real test suite exists, or more than
one implementation of a dependency is needed. All three hold here: a read-through cache with a
circuit breaker, a full multi-level test suite, a real and a fake vendor, and two authentication
strategies.

## Related decisions

- ADR-0002 — layered, AWS-free domain.
- ADR-0015 — factory-based dependency injection with ports and a composition root.
- ADR-0023 — configurable authentication (external-IdP JWT or Cognito) behind a stable seam.
- ADR-0024 — the fake vendor selected when no vendor URL is configured.
