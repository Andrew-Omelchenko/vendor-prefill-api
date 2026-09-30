# 26. Stage-wide resource in the authorizer policy for safe result caching

- Status: Accepted
- Date: 2026-09-30
- Refines: ADR-0012, ADR-0023

## Context

The custom Lambda (TOKEN) authorizer had result caching enabled (`resultsCacheTtl` = 5 minutes)
while returning a policy scoped to the exact invoked method (`event.methodArn`). API Gateway keys
the authorizer result cache on the token alone, not on the method, and the method ARN includes the
resolved path — which for this API contains the resource id. A cached policy produced for one
id/method was therefore reused for other ids/methods with the same token within the TTL and, being
scoped to the original method ARN, denied them with HTTP 403. Caching was effectively incorrect for
any client that touched more than one id or method inside the cache window. It went unnoticed
because only the `demo` environment (which has no authorizer) had been exercised.

## Decision

Return a stage-wide resource in the authorizer policy —
`arn:aws:execute-api:<region>:<account>:<apiId>/<stage>/*` — instead of the single method ARN. The
cached allow/deny decision then legitimately covers every method and path in the stage, so caching
is both correct and beneficial (fewer authorizer invocations, lower latency). The authorizer stays a
coarse, per-token gate; per-object authorization (ownership) is enforced in the domain service (see
the BOLA design), keeping "is this a valid caller?" separate from "may this caller act on this
object?".

## Consequences

- Result caching works as intended: a valid token is no longer spuriously denied across ids or
  methods within the TTL.
- The authorizer no longer expresses per-method decisions. This is intentional — object-level checks
  belong in the service layer, not in a token-keyed cache.
- The Cognito authorizer path is unaffected (it validates the JWT and authorizes per each method's
  own settings; it returns no custom policy). The `demo` environment is unaffected (no authorizer).
- Alternative considered: disabling caching (`resultsCacheTtl` = 0) would also be correct but would
  invoke the authorizer on every request, losing the latency and cost benefit; rejected.
