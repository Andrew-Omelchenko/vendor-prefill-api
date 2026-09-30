# Object-level authorization (BOLA)

Status: planned. Applies to the authenticated environments (`dev`, `staging`, `prod`); explicitly
**not** the `demo` environment, which is intentionally open with mock data.

## The problem

The API authenticates every caller at the edge (a valid JWT, or Cognito), but it does not check
that the authenticated caller is allowed to act on the **specific record** they name. On a
resource addressed by id — `GET /prefill/{id}`, and likewise `PUT`/`DELETE` — a valid caller can
change the id and reach a record that is not theirs. This is _Broken Object-Level Authorization_
(OWASP API Security Top 10, API1), also called IDOR. Authentication answers "is this a valid
caller?"; object-level authorization answers "may **this** caller act on **this** object?" — and
only the first is enforced today.

## Decide the ownership model first

BOLA enforcement only makes sense once "owns" is defined, and this domain has two kinds of record:

- **Manually created records** (`POST`, then `PUT`/`DELETE`) — these have a creator and are
  naturally _owned_. Owner-based checks apply directly.
- **Read-through vendor lookups** (`GET` cache-miss → vendor → cache) — these are shared reference
  data keyed by id, not owned by any one caller. For these, "authorization" is more naturally
  **scope-based** ("does the caller hold the `prefill:read` scope?") than owner-based.

So the first task is a product/security decision: are prefill records per-caller resources, or a
shared cache of vendor data? The design below assumes the stricter, owner-based model for the
write-created records, and scope checks for the shared read path. If the product treats all
records as owned, apply the owner check to `GET` as well.

## Design

### 1. Add an owner to the record

Add `ownerId` to the entity (source of truth is the zod schema, so the type and OpenAPI follow):

```ts
// src/domain/schemas.ts
export const prefillRecordSchema = vendorPayloadSchema.extend({
  cachedAt: z.string(),
  version: z.number().int(),
  ownerId: z.string().min(1).optional(), // optional during rollout; see migration
});
```

`ownerId` is set by the service on create; it is never accepted from the request body (the create
schema stays strict and does not include it).

### 2. Carry the caller identity from the authorizer to the service

The authorizer already returns the caller in its context (`sub`, `scope`). API Gateway exposes
that to the handler, though the shape differs by authorizer type, so normalize it:

```ts
// src/handlers/caller.ts
export interface Caller {
  sub: string;
  scope: string;
}

export function callerFrom(event: APIGatewayProxyEvent): Caller | undefined {
  const a = event.requestContext.authorizer as Record<string, unknown> | undefined;
  const claims = a?.claims as Record<string, unknown> | undefined; // Cognito shape
  const sub = (a?.sub ?? claims?.sub) as string | undefined; // custom-authorizer shape
  const scope = (a?.scope ?? claims?.scope ?? '') as string;
  return typeof sub === 'string' && sub.length > 0 ? { sub, scope } : undefined;
}
```

In the `demo` environment there is no authorizer, so `callerFrom` returns `undefined` — which is
correct: object-level authorization does not apply where there is no identity.

### 3. Enforce in the domain service (not scattered across handlers)

Pass the caller into the service so the rule lives in one tested place and is consistent across
handlers. Add a `Caller` parameter to the write methods (and to `getPrefill` if the strict model
is chosen):

```ts
// src/domain/prefill-service.ts (sketch)
async updatePrefill(id, input, caller, expectedVersion) {
  // ownership is enforced atomically by the repository (see 4), so no read-then-check race
  return repository.update(id, fields, caller.sub, expectedVersion);
}
```

Handlers extract the caller and reject when it is required but absent:

```ts
const caller = callerFrom(event);
if (!caller) return json(401, { error: 'unauthenticated' });
```

### 4. Prefer atomic ownership checks over read-then-check

For `PUT`/`DELETE`, add the owner to the DynamoDB `ConditionExpression` alongside the existing
version check (ADR-0009), so ownership and concurrency are enforced in one conditional write with
no time-of-check/time-of-use race:

```
ConditionExpression: 'attribute_exists(pk) AND #owner = :sub AND #v = :expected'
```

Map a conditional failure to **404 Not Found**, not 403 — returning 403 would tell a non-owner
that the id exists. (This mirrors the existing not-found handling; distinguishing "wrong version"
from "wrong owner" is deliberately avoided for the same reason.)

For `GET` under the strict model, read the item then compare `ownerId` to `caller.sub`, returning
404 on mismatch.

### 5. Create sets the owner

```ts
async createPrefill(input, caller) {
  const record = { ...built, ownerId: caller.sub };
  await repository.save(record);
}
```

## Rollout and migration

- **Config-gated enforcement.** Enforce in `dev`/`staging`/`prod`; the `demo` path has no caller
  and is unaffected. A per-environment flag (e.g. `enforceObjectAuth`) allows enabling it in lower
  environments first.
- **Existing records without `ownerId`.** Choose a policy: treat a missing owner as legacy and
  deny writes to it (safe default), or run a one-time backfill. `ownerId` is `optional` in the
  schema during this window and made required once backfilled.
- **No infrastructure change.** This is an application-layer control; the stack and cdk-nag are
  unaffected.

## Testing

- Unit: create sets `ownerId`; update/delete allowed for the owner; update/delete of another
  caller's record yields 404; `GET` under the strict model returns 404 on mismatch.
- Component: same paths driven through the handler with a synthesized authorizer context.
- Confirm 404 (not 403) on the non-owner path, so existence is not disclosed.

## Related decisions

- ADR-0012 / ADR-0023 — authentication (the identity this control builds on).
- ADR-0003 — per-function least-privilege IAM (authorization at the infrastructure layer;
  BOLA is its application-layer counterpart).
- ADR-0009 — optimistic concurrency (the conditional-write mechanism reused here).

Implementing this should add a new ADR recording the ownership-model decision and the 404-on-
mismatch choice.
