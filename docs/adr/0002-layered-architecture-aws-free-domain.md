# 2. Layered architecture with an AWS-free domain core

- Status: Accepted
- Date: 2026-09-24

## Context

Serverless code often mixes AWS SDK calls with business logic, which makes it slow to test and hard
to change.

## Decision

Separate infrastructure (`lib/`, `bin/`) from application code (`src/`). Within `src`, the domain
layer (`src/domain`) imports no AWS SDKs; handlers are thin HTTP adapters and clients wrap AWS and
vendor I/O.

## Consequences

- Domain logic tests run in milliseconds with no AWS; infrastructure changes do not ripple into
  business logic.
- There is an extra layer of indirection and some mapping boilerplate between HTTP, domain, and
  persistence.
