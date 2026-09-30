# Roadmap / planned work

Candidate next steps for `vendor-prefill-api`, roughly in priority order. Each entry states why it
matters and how it would be approached. Items with a dedicated design doc link to it.

## Correctness & security

### 1. Object-level authorization (BOLA)

**Why:** the API authenticates callers but does not check that a caller may act on the _specific_
record they name, so a valid caller could reach another's record by changing the id (OWASP API1).
**How:** add an owner to the record, carry the caller identity from the authorizer into the domain
service, and enforce ownership atomically in the conditional write (returning 404, not 403, on
mismatch). Applies to `dev`/`staging`/`prod`; the open `demo` env is excluded by design.
Detailed design: [bola-object-level-authorization.md](bola-object-level-authorization.md).

### 2. Reconcile the Node 24 runtime fixes into the repository

**Why:** the fixes discovered during the first real deploy — CommonJS Lambda bundling and
async-only handler signatures (Node 24 removed callback handlers) — currently live only in local
edits. The repository should reflect the working, deployed state.
**How:** apply the bundling format and handler-signature changes, update the affected tests, re-run
the full gate on all environments, and add an ADR recording the Node 24 bundling/interop decision
(ESM + a CommonJS dependency needs a `createRequire` banner; CommonJS bundling avoids the hazard).

### 3. Idempotent writes

**Why:** `POST /prefill` is not idempotent; a retried create currently returns 409 rather than the
original result, and network retries can produce confusing outcomes.
**How:** accept an `Idempotency-Key` header and deduplicate on it — either with a small dedup table
(store the first response keyed by the idempotency key + a TTL) or via a maintained library
(e.g. Powertools for AWS Lambda idempotency). Return the original response on replay.

## Observability & delivery (role-aligned)

### 4. DataDog integration

**Why:** the target role names DataDog; the project currently uses CloudWatch (logs, EMF metrics,
dashboard, alarms).
**How:** add the Datadog Lambda extension layer, source `DD_API_KEY` from Secrets Manager, tag by
service/env, and forward logs/metrics/traces — wired through the CDK stack (a Datadog CDK construct
or a manual layer + environment). The structured logs and correlation id already in place map onto
Datadog cleanly.

### 5. Continuous delivery with a post-deploy smoke gate

**Why:** the packaging/runtime bugs found on first deploy (ESM interop, Node 24 handlers) are
exactly the class of failure that in-process tests cannot catch; only a real deployed stage does.
**How:** extend the pipeline to deploy to a test/staging stage on merge and run the existing
opt-in smoke suite (`test/smoke`, `SMOKE_BASE_URL`) as a required gate before promoting, with
rollback on failure. This operationalizes the lesson behind the smoke tests.

## Hardening

### 6. Secrets rotation for the vendor key

**Why:** the vendor API key is stored in Secrets Manager but not rotated (the corresponding
cdk-nag rule is currently suppressed with justification).
**How:** add a rotation schedule and a rotation Lambda if the vendor supports programmatic key
rotation; otherwise document the manual rotation runbook and keep the suppression with that
reference.

### 7. Edge protection for public endpoints

**Why:** the `demo` environment is publicly callable and relies only on stage throttling; a WAF or
usage plan would bound abuse of an open endpoint.
**How:** extend the (currently prod-gated) WAF web ACL to open environments
(`isProd || disableAuth`), or attach an API-key usage plan. A one-line gate change plus a decision
on cost.

### 8. SLOs and richer alarms

**Why:** the only alarm today is on the circuit breaker opening; there is no latency or error-rate
signal.
**How:** define SLOs (e.g. p99 latency, 5xx rate) and add CloudWatch alarms (and Datadog monitors,
once #4 lands) wired to the existing SNS topic.

## Evolution

### 9. List / pagination endpoint

**Why:** records are only addressable by id; there is no way to enumerate them.
**How:** add `GET /prefill` with cursor-based pagination (DynamoDB `LastEvaluatedKey`), and a GSI
if access patterns beyond the partition key are needed. Only worth doing if the product requires
enumeration.

### 10. Java/Spring → serverless modernization plan

**Why:** the target role centers on modernizing Java/Spring services to serverless; a written
migration approach is a strong artifact.
**How:** a strangler-fig plan — front the legacy service with the API Gateway, route endpoints to
Lambda incrementally, share the contract (OpenAPI), and retire the monolith route by route. Worth
its own document when picked up.
