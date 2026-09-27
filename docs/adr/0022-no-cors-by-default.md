# 22. No CORS by default (server-to-server API)

- Status: Accepted
- Date: 2026-09-24

## Context

CORS was never decided explicitly. Leaving it undefined is a silent choice; enabling it broadly
would invite browser calls the design does not intend.

## Decision

Make the decision explicit: this API is consumed server-to-server behind the enterprise gateway, not
from browsers, so CORS is off by default — no `Access-Control-Allow-Origin`, no preflight OPTIONS
methods. A per-environment `cors.allowOrigins` config hook exists; only when it is set does the stack
add scoped preflight options. No environment sets it.

## Consequences

- No browser can call the API cross-origin unless a future maintainer opts in deliberately, per
  environment, with named origins.
- Enabling CORS would add unauthenticated OPTIONS preflight methods, which would need their own
  cdk-nag handling — a cost that stays out of the default path.
