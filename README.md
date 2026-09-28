# Vendor Prefill API

A production-shaped serverless reference project: a contract-first REST API on
**AWS API Gateway + Lambda (Node.js 24) + DynamoDB**, provisioned with **AWS CDK**
(TypeScript). It reads through a **DynamoDB TTL cache** to an external vendor behind a
**circuit breaker**, supports create/update/delete with **optimistic concurrency**, and is
authenticated at the edge. Authentication and the vendor integration are **chosen from
configuration**, so the same code runs against real enterprise infrastructure or stands up
fully self-contained. Tested at four levels (unit / component / integration / smoke) with a
coverage gate, security-linted with cdk-nag, and shipped through GitHub Actions.

Every significant decision is recorded as an ADR under [`docs/adr/`](docs/adr/), and the
original code review plus its (completed) phased improvement plan lives in
[`docs/review/`](docs/review/).

## Layout

```
bin/
  app.ts                     CDK entry point; selects the environment (and auth mode)
  ci-bootstrap.ts            admin-run: GitHub OIDC provider + scoped deploy role
lib/vendor-prefill-stack.ts  the stack: DynamoDB + KMS + Lambdas + API GW + WAF + IAM + alarms
config/index.ts              per-environment NON-SECRET config (committed)
src/
  domain/                    logic + ports (interfaces), zod schemas, types, validation, errors
    ports.ts                   dependency-inversion interfaces (repo, vendor, secrets, logger, clock)
    prefill-service.ts         business logic as a factory over ports (no AWS, no I/O)
    schemas.ts                 zod = single source of truth for shapes, types, and OpenAPI
  clients/                   adapters: DynamoDB repository, HTTP vendor client, fake vendor
  handlers/                  pure handler factories + shared wrapper (error->HTTP mapping)
  entry/                     composition root + cold-start wiring (CDK points here)
  lib/                       runtime-config, secrets, logger, redaction, metrics, http, jwt
test/
  unit/                      one module at a time, plain fakes (no jest.mock, no env)
  component/                 real handlers+service+repo over supertest, DynamoDB mocked
  integration/               repository against a real DynamoDB API (dynalite, in-process)
  smoke/                     opt-in deployed-stage checks (SMOKE_BASE_URL)
scripts/generate-openapi.ts  generates openapi/prefill.json from the zod schemas
openapi/prefill.json         generated OpenAPI 3.0 spec (CI fails if it drifts)
docs/                        architecture, ADRs, the code review, and an onboarding guide
.github/workflows/ci.yml     format -> lint -> test(+coverage) -> synth (x3) -> openapi:check
```

## Architecture at a glance

The load-bearing rule: **`bin/` + `lib/` is infrastructure, `src/` is application code, and
`src/` imports no CDK.** Dependencies are inverted behind ports (`src/domain/ports.ts`) and
wired by a composition root (`src/entry/`), the only place with cold-start side effects. The
result: handlers, service, and adapters are pure factories that tests construct with plain
fakes — no mocking framework, no environment setup — and infra changes never ripple into
business logic.

A request flows: **ApigeeX (enterprise edge)** → **API Gateway** (JWT/Cognito authorizer,
WAF, throttling, request validation) → **Lambda** (validate with zod, read-through cache,
call the vendor behind a breaker) → **DynamoDB** and the **external vendor**. See
[`docs/architecture/`](docs/architecture/) for the diagram and the trust boundary.

## Prerequisites

- Node.js 24 (`node -v`) — the Lambdas target the `nodejs24.x` runtime.
- AWS credentials configured (`aws configure` / SSO).
- First time in an account/region: `npx cdk bootstrap`.

## Quick start

```bash
npm ci
npm test                 # unit + component + integration, no AWS needed
npm run test:coverage    # same, with the coverage gate enforced
npm run synth            # compile the CDK app to CloudFormation (also runs cdk-nag)
npm run deploy:dev       # deploy the dev stack (self-contained: fake vendor, see below)
```

## npm scripts

- `build` — type-check only (`tsc --noEmit`).
- `lint` / `lint:fix` — ESLint (flat config, TypeScript, Prettier-compatible).
- `format` / `format:check` — Prettier.
- `test` — unit + component + integration (Jest; smoke excluded).
- `test:coverage` — the above with global coverage thresholds enforced.
- `test:smoke` — deployed-stage smoke tests; skipped unless `SMOKE_BASE_URL` is set.
- `openapi:generate` / `openapi:check` — regenerate / verify the OpenAPI spec from zod.
- `synth` / `diff` — `cdk synth` / `cdk diff`.
- `deploy:dev` / `deploy:staging` / `deploy:prod` / `deploy:demo` — `cdk deploy -c env=<env>`.
- `bootstrap:ci` — one-time admin task: create the GitHub OIDC provider + scoped deploy role.

## Configuration and secrets

Two categories, handled two ways.

**Non-secret config** (region, cache TTL, log level, throttling, Lambda sizing, and which
auth/vendor mode to use) lives in `config/index.ts`, keyed by environment and selected with
`cdk deploy -c env=<dev|staging|prod|demo>`. `bin/app.ts` names each stack `VendorPrefill-<env>`
so environments never collide.

**Secrets** (the vendor API key) live in AWS Secrets Manager, one per environment. CDK only
references the secret **by name** and grants the Lambda read access; the value never enters
CloudFormation. The function fetches it at runtime and caches it in the warm container
(`src/lib/secrets.ts`). Create secrets out-of-band, e.g.:

```bash
aws secretsmanager create-secret \
  --name vendor-prefill/prod/vendor-api-key \
  --secret-string 'the-real-key'
```

Copy `.env.example` to `.env` for local work; real keys never touch a developer laptop.

## Authentication (config-driven)

Chosen at deploy time (ADR-0012 / ADR-0023):

- **External IdP** — when `config.auth` (issuer, audience, JWKS URI) is set, a Lambda TOKEN
  authorizer (`jose`) validates JWTs from that issuer on every method. This is the path for
  environments behind the enterprise ApigeeX gateway. Callers send
  `Authorization: Bearer <jwt>`.
- **Cognito fallback** — when `config.auth` is omitted, the stack provisions a hardened
  Cognito user pool (strong password policy, required TOTP MFA, Plus-tier threat protection,
  no self-sign-up) and a Cognito authorizer. Callers send the raw ID token in `Authorization`
  (no `Bearer ` prefix).

`cdk deploy -c env=dev -c authMode=cognito` forces the Cognito path regardless of config; CI
synthesizes both branches.

The **demo** environment sets `disableAuth` and attaches **no authorizer** — a public API,
safe only because it holds no secrets and serves mock vendor data (ADR-0025). See [`docs/onboarding/`](docs/onboarding/) for how to obtain a
token in each mode.

## Vendor integration (config-driven)

- **Real vendor** — when `VENDOR_BASE_URL` (and its API-key secret) are configured, the GET
  path calls the vendor over HTTPS behind an `opossum` circuit breaker with a timeout and a
  null fallback, and caches successful reads in DynamoDB with a TTL.
- **Fake vendor** — when `VENDOR_BASE_URL` is unset, an in-process fake returns in-contract,
  deterministic-per-id records with no network call and no extra dependency (ADR-0024). The
  **dev** environment omits the vendor URL and is therefore self-contained — its GET path
  works with no upstream.

## Testing

Four levels, each failing for one reason (ADR-0019):

- **unit** — a single module with injected fakes; no I/O.
- **component** — the real handlers + service + repository wired together and driven over
  HTTP (Supertest), with DynamoDB mocked and the vendor stubbed.
- **integration** — the repository against a real DynamoDB API surface via `dynalite`
  (in-process; no Docker or Java), exercising conditional writes on the wire.
- **smoke** — opt-in checks against a deployed stage (`npm run test:smoke` with
  `SMOKE_BASE_URL` / `SMOKE_TOKEN`).

`test:coverage` enforces global thresholds; the composition root (`src/entry/`) is excluded
because it is cold-start wiring exercised at deploy time.

## Observability

Structured JSON logs carry a per-request **correlation id** (from an inbound
`x-correlation-id` header or the API Gateway request id), propagated to every log line via
`AsyncLocalStorage` and echoed back on the response. A denylist in the logger redacts PII and
secret-ish fields as defense in depth. A circuit-breaker **open** event emits a CloudWatch EMF
metric; the stack ships a dashboard and SNS alarms, and API Gateway access + method logs are
enabled (request/response bodies are never logged).

## Security & compliance

- Every method requires authorization (external-IdP JWT or Cognito).
- WAFv2 web ACL (AWS common rules + per-IP rate limit) in prod; stage throttling in all envs.
- Per-function least-privilege IAM (a read function cannot write, and vice versa).
- DynamoDB encrypted with a customer-managed KMS key; point-in-time recovery and deletion
  protection in prod.
- Domain field constraints (e.g. `riskScore` bounds) enforced from zod at the edge and in the
  Lambda; a documented PII logging policy with redaction.
- **cdk-nag** (`AwsSolutionsChecks`) runs on every synth and fails the build on findings;
  exceptions are recorded as documented, evidence-based suppressions.
- CORS is off by default (server-to-server behind ApigeeX); configurable per environment.

## CI/CD

GitHub Actions authenticates to AWS with **OIDC** (no static keys). Pull requests run
`format:check` → `lint` → `test:coverage` → `synth` for dev, prod, and the Cognito fallback →
`openapi:check`. The prod deploy job assumes the scoped role via OIDC. One-time setup is in
[`docs/onboarding/`](docs/onboarding/).

## Documentation

- [`docs/architecture/`](docs/architecture/) — how the system works and the trust boundary.
- [`docs/adr/`](docs/adr/) — the 24 architecture decision records and why each was made.
- [`docs/review/`](docs/review/) — the original code review and the phased plan (all phases
  complete).
- [`docs/onboarding/`](docs/onboarding/) — deployment, auth, and verification runbook.
