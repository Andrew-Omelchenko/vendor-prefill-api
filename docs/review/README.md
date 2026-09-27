# Code review — vendor-prefill-api

Reviewed as if bound for production. Severity legend:
**[Critical]** ship-blocker · **[High]** fix soon · **[Medium]** should fix · **[Low]** nice to have.

Each finding: what it is → why it matters → the fix. The improvement plan at the end is a
checklist — tick items off as they land so this file also tracks progress.

---

## Strengths (recorded for balance)

- Clean layering: `src/domain` has no AWS imports, so business logic is fast and simple to test.
- Least-privilege IAM per function (GET read/write + secret; writers write-only, no secret).
- Correct optimistic concurrency via conditional writes + `ReturnValuesOnConditionCheckFailure`.
- Single-source validation (zod → handler + API Gateway model), secrets by reference not value,
  EMF metrics (no PutMetricData), OIDC CI with a separate bootstrap stack.

The rest of this document is deliberately about what is missing.

---

## Security

### [Critical] The API has no authentication or authorization

`lib/vendor-prefill-stack.ts` creates the REST API and methods with no authorizer, no API key, no
IAM auth. Anyone who learns the invoke URL can read, create, update, and delete records — in a
domain that handles PII / insurance data. "ApigeeX sits in front" is not a control: the raw API
Gateway URL is still reachable and bypasses Apigee entirely.
**Fix:** add an authorizer (JWT/Cognito, Lambda authorizer, or IAM auth) on every method, and/or
require a shared secret header that only Apigee sends; consider a private API if callers are
internal. This should block a deploy.

### [High] No throttling, usage plan, or WAF

No per-client rate limiting and no `UsagePlan`. A create endpoint with no limit is an abuse and
cost risk. **Fix:** stage throttling defaults, a usage plan (if API keys are used), and AWS WAF for
a public API.

### [High] The secret cache never expires — rotation silently breaks

`src/lib/secrets.ts` caches the value in a `Map` for the life of the warm container with no TTL. A
rotated key means warm Lambdas keep sending the old one until they recycle → intermittent 401s.
**Fix:** add a short TTL to the cache, or use the AWS Parameters and Secrets Lambda Extension.

### [High] CI deploy role trust is scoped too broadly

`lib/ci-bootstrap-stack.ts` trusts `repo:<owner>/<repo>:*` — any workflow on any branch or PR can
assume the deploy role. **Fix:** scope `sub` to a branch or GitHub Environment, e.g.
`...:ref:refs/heads/main` or `...:environment:production`, and gate prod behind a reviewer.

### [Medium] PII-sensitive domain with no logging/redaction policy

Records hold `fullName` and vendor data. Logs currently include only `id`, but nothing prevents a
full record from being logged later, and there is no field-level redaction. **Fix:** document a
"never log PII" rule, add a redacting log helper, and review X-Ray/EMF for accidental capture.

### [Low] Data-at-rest hardening

DynamoDB uses the default AWS-owned key and has no `deletionProtection`. **Fix (if compliance
requires):** customer-managed KMS key + `deletionProtection: true` on the prod table.

### [Low] CORS is undefined

Fine for server-to-server; a blocker if a browser ever calls it. **Fix:** decide explicitly and
configure preflight if needed.

---

## Configuration & reliability

### [High] No validated runtime config — unsafe env casts scattered across modules

`src/*` reads `process.env.TABLE_NAME as string` and similar in five modules. The `as string` casts
hide missing-env bugs until a cryptic runtime failure. **Fix:** one runtime-config module that
parses `process.env` with a zod schema at cold start and fails fast; everything else imports the
typed, validated object.

### [High] Metric name/namespace is defined twice and can drift silently

`src/lib/metrics.ts` hard-codes `VendorPrefill` / `VendorCircuitOpen`; `lib/vendor-prefill-stack.ts`
declares the same independently for the alarm. Change one and the alarm silently stops matching the
emitted metric — no error, no alert. **Fix:** share the constants, or pass the metric name to the
Lambda via env from the stack.

### [Medium] `getPrefill` reconstructs the record instead of reading it back

On the vendor path it returns a record whose `cachedAt` is generated separately from the one
`putCached` writes, so the response differs from what is stored. **Fix:** build the record once and
pass it to the repository.

### [Medium] Circuit-breaker tuning is hard-coded and not environment-aware

`3000` / `50` / `15_000` are magic numbers in `vendor-client.ts`, while other sizing lives in
`config/index.ts`. **Fix:** move them into `AppConfig`.

### [Medium] No reserved concurrency

A spike can exhaust account concurrency and starve other functions; the vendor-calling function can
also open many upstream connections at once. **Fix:** set `reservedConcurrentExecutions`.

---

## Modularity & maintainability

### [Medium] Module-level singletons + import-time side effects

Repository, vendor-client, secrets, logger, and metrics all read env and/or construct clients at
import time. This couples modules to the environment and forces tests to set `process.env` before
importing. **Fix:** lightweight dependency injection — factory functions that receive validated
config and clients.

### [Medium] Handler boilerplate is duplicated; error→status mapping is copy-pasted

`post` and `put` repeat body-parse + try/catch + error translation. **Fix:** a shared handler
wrapper that parses/validates and maps known domain errors to responses in one place; consider
RFC 7807 `application/problem+json` for the error body.

### [Medium] The OpenAPI spec duplicates the zod schema and will drift

`openapi/prefill.yaml` is hand-maintained while zod is the enforced source of truth. **Fix:**
generate the OpenAPI (or its schemas) from zod, or drop the hand file and generate docs.

### [Low] Weak domain validation

`riskScore: z.number()` allows negatives, huge values, and fractions. **Fix:** add real bounds.

### [Low] Two overlapping structured-output paths (`logger` + `metrics`)

Both wrap `console.log` and read env at import. **Fix:** fold into one observability module.

---

## Observability

### [Medium] No correlation id in logs

Logs carry `id` but not the API Gateway request id or X-Ray trace id, so one request's log lines
cannot be stitched together. **Fix:** a per-invocation child logger with bound request/trace id.

### [Medium] Errors log `message` only, not the stack

Handlers discard the stack trace. **Fix:** log the full error (name + message + stack).

### [Medium] No API Gateway access/execution logs

Only X-Ray tracing is on. **Fix:** enable access logs (and execution logs in non-prod).

### [Medium] No `cdk-nag`

No automated security/best-practice linting of the synthesized stack — which would have flagged the
missing authorizer. **Fix:** add cdk-nag (AwsSolutions pack) and run it in CI.

---

## Testing

### [Medium] "Integration" tests are in-process handler tests

`test/integration/api.test.ts` drives handlers through an Express adapter with DynamoDB mocked — it
exercises neither real API Gateway mapping, the edge validator, nor auth. **Fix:** rename to
component tests; add a true integration test (LocalStack / DynamoDB Local) and a smoke test against
a deployed dev stage.

### [Medium] No coverage gates; a few real paths untested

No coverage thresholds; the GET `502` path, POST `409` end-to-end, and the breaker-open → metric
wiring are uncovered. **Fix:** set thresholds in CI and add the missing cases.

### [Low] Tests depend on env set before import

A symptom of the import-time coupling above; resolved once config is injected.

---

## Improvement plan (progress tracker)

Ordered by risk-reduction per unit of effort. Each phase is independently shippable.

### Phase 0 — Security blockers (before any real deploy) — DONE

- [x] Add authN/authZ to every method — JWT authorizer (Lambda TOKEN authorizer, `jose`)
      applied via `defaultMethodOptions`; a valid token is required, which also closes the
      Apigee-bypass hole.
- [x] Add stage throttling + WAF — stage rate/burst limits on every env; a prod-gated WAF
      (AWS common rules + per-IP rate limit). Usage-plan/API-keys skipped intentionally (auth is
      JWT-based, not key-based).
- [x] Tighten the CI deploy role `sub` to a branch/environment (defaults to `ref:refs/heads/main`).
- [x] Give the secret cache a TTL (default 5 min, `SECRET_CACHE_TTL_MS`).

### Phase 1 — Reliability & config hygiene — DONE

- [x] Introduce a zod-validated runtime-config module; remove all `as string` env reads
      (`src/lib/runtime-config.ts`; see ADR-0014).
- [x] Share the metric namespace/name between `src` and the stack (`src/lib/metric-names.ts`).
- [x] Fix the `getPrefill` read-back / timestamp drift (`putCached` now returns the stored record).
- [x] Add reserved concurrency (GET function) and move circuit-breaker tuning into config.

### Phase 2 — Maintainability & modularity — DONE

- [x] Introduce factory-based DI; remove import-time side effects (ports + `src/entry` composition;
      see ADR-0015).
- [x] Extract a shared handler wrapper + centralized error→response mapping
      (`src/handlers/handler-wrapper.ts`).
- [x] Generate the OpenAPI spec from zod (`scripts/generate-openapi.ts`, `openapi:check` in CI;
      see ADR-0016).

### Phase 3 — Observability — DONE

- [x] Correlation id per request via AsyncLocalStorage (reaches service/adapter logs), echoed in the
      `x-correlation-id` response header; unhandled errors logged with name + stack (ADR-0017).
- [x] API Gateway access logs + method logging (payloads off for PII); cdk-nag `AwsSolutionsChecks`
      runs on every synth in CI, dev and prod (ADR-0018).

### Phase 4 — Testing — DONE

- [x] Coverage gate in CI (`test:coverage`, global thresholds; `src/entry` excluded); 502 / 409 /
      breaker-open paths covered (ADR-0019).
- [x] In-process suite renamed to component; real integration test on dynalite; opt-in deployed-stage
      smoke test (`npm run test:smoke`).

### Phase 5 — Data & compliance (PII domain) — DONE

- [x] Bounded field schemas (riskScore range, id charset, length limits) shared by validator, edge
      model, and OpenAPI; PII/sensitive-data logging policy with logger-level redaction (ADR-0020).
- [x] DynamoDB customer-managed KMS key + prod deletion protection (ADR-0021); CORS explicitly off
      by default, configurable per environment (ADR-0022).

> **All phases (0–5) complete.** Every item in this plan is implemented, tested, and gated in CI.

---

## Summary

The architecture and patterns are sound; the gaps are the ones that separate a strong reference
project from a production service — chiefly **authentication (Critical)**, **validated runtime
config**, and **the metric-name drift between code and infra**. Fix Phase 0, then work down.
