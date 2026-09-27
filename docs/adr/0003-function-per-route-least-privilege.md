# 3. Function per route with least-privilege IAM

- Status: Accepted
- Date: 2026-09-24

## Context

A single Lambda handling every route couples permissions and blast radius across operations.

## Decision

Use one Lambda per route (GET/POST/PUT/DELETE) plus a separate authorizer function. Grant each
function exactly the access it needs — the read path gets read/write plus the secret; write paths
get write-only and no secret.

## Consequences

- Tight, intention-revealing IAM and independent scaling and observability per route.
- More functions to manage and a slightly larger cold-start surface.
