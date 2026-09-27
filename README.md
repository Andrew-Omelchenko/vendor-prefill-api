# Vendor Prefill API

A production-shaped serverless reference project: a contract-first REST API on
**AWS API Gateway + Lambda (Node.js 24) + DynamoDB**, provisioned with **AWS CDK**
(TypeScript), calling an external vendor behind a **circuit breaker** with a
**DynamoDB TTL cache**. Tested with **Jest + Supertest**, shipped with **GitHub Actions**.

## Layout

```
bin/app.ts                  CDK entry point; selects the environment
lib/vendor-prefill-stack.ts The stack: DynamoDB + Lambda + API GW + IAM + logs
config/index.ts             Per-environment NON-SECRET config (committed)
src/handlers/               Thin Lambda adapters: get / post / put / delete
src/domain/                 Logic, types, zod schemas, validation, errors (no AWS imports)
src/clients/                vendor-client (circuit breaker) + repository (DynamoDB)
src/lib/                    secrets, logger, EMF metrics, http helpers
test/unit, test/integration Jest unit tests (incl. mocked-DynamoDB repo) + Supertest API tests
openapi/prefill.yaml        Contract-first OpenAPI 3.0 spec
.github/workflows/ci.yml    lint -> test -> synth -> (deploy prod from main)
```

The load-bearing decision: **`lib/`+`bin/` is infrastructure, `src/` is application
code, and `src/` imports no CDK.** That keeps handlers and logic testable in
milliseconds without AWS, and keeps infra changes from rippling into business code.

## Prerequisites

- Node.js 24 (`node -v`)
- AWS credentials configured (`aws configure` / SSO)
- First time in an account/region: `npx cdk bootstrap`
- Ensure `aws-cdk-lib` is recent enough to expose `Runtime.NODEJS_24_X`
  (any release from late 2025 onward). `npm i aws-cdk-lib@latest` if `synth` complains.

## Run it

```bash
npm ci
npm test                 # unit + integration, no AWS needed
npm run synth            # compile the CDK app to CloudFormation
npm run deploy:dev       # deploy the dev stack  (cdk deploy -c env=dev)
npm run deploy:staging
npm run deploy:prod
```

## One-time account setup

Done once per account/region, outside the app deploy — these are inputs to CDK, not things
the app stack can create for itself:

1. **Bootstrap CDK:** `npx cdk bootstrap aws://<account-id>/<region>` — creates the assets
   bucket and roles CDK deploys through. (Deploy fails without it.)
2. **Create the vendor secret** per env (its value comes from the vendor, so it stays out of
   code; the stack only references it by name):
   `aws secretsmanager create-secret --name vendor-prefill/dev/vendor-api-key --secret-string '<key>'`
3. **Fix `config/index.ts`:** set the real `region` and `vendorBaseUrl` (defaults are placeholders).

Automated by CDK (optional):

- **CI deploy role (GitHub OIDC):** `npm run bootstrap:ci -- -c repo=owner/name` deploys a
  separate, admin-run stack that creates the OIDC provider + a least-privilege deploy role, and
  outputs its ARN. Put that ARN in the `AWS_DEPLOY_ROLE_ARN` GitHub secret. (Add
  `-c oidcArn=<arn>` if the account already has a GitHub OIDC provider.)
- **Alarm notifications:** set `alarmEmail` for an env in `config/index.ts` and the alarm SNS
  topic gets that subscription automatically (confirm the email once).

## Configuration vs secrets — the important part

Two categories, handled two different ways.

### 1. Non-secret config -> committed, chosen at deploy time

Region, table settings, vendor base URL, cache TTL, log level, Lambda sizing.
None of this is sensitive, so it lives in `config/index.ts`, keyed by environment.
You pick the environment with CDK context:

```bash
cdk deploy -c env=dev        # or staging / prod
```

`bin/app.ts` reads `env`, loads that config object, and names the stack
`VendorPrefill-<env>` so the three environments never collide.

### 2. Secrets -> AWS Secrets Manager, never in git, never in CloudFormation

Vendor API keys, tokens, DB passwords. Rules:

- **Never** commit a secret, and **never** put a real secret in a Lambda env var
  in plaintext or in CDK code (CDK values end up in the CloudFormation template).
- Store one secret **per environment**, with the env in the name:
  `vendor-prefill/dev/vendor-api-key`, `.../staging/...`, `.../prod/...`.
- CDK only **references the secret by name** (`Secret.fromSecretNameV2`) and
  **grants the Lambda read access** (`vendorApiKey.grantRead(fn)`). Only the
  secret _name_ is passed to the function as an env var.
- The Lambda fetches the value **at runtime** (`src/lib/secrets.ts`) and caches it
  in the warm container, so Secrets Manager is hit once per cold start, not per request.

Create the secrets out-of-band (once per environment):

```bash
aws secretsmanager create-secret \
  --name vendor-prefill/dev/vendor-api-key \
  --secret-string 'the-real-dev-key'
# repeat for staging and prod (ideally from a secure machine / CI, not a laptop)
```

Cheaper alternative: **SSM Parameter Store `SecureString`** works the same way and
costs less; Secrets Manager adds built-in rotation. To cut the cold-start read
entirely, the **AWS Parameters and Secrets Lambda Extension** caches values in a
sidecar — swap it in later without touching the handler.

### 3. Local development

Copy `.env.example` to `.env` (gitignored). Use a **sandbox** vendor URL and a
throwaway local key, or mock the vendor entirely. Real prod/staging keys never
touch a developer laptop.

### 4. CI/CD

GitHub Actions authenticates to AWS with **OIDC** (`aws-actions/configure-aws-credentials`
assuming an IAM role) — no static AWS keys stored in GitHub. Any deploy-time secret
uses **GitHub Environments + encrypted secrets**, scoped per environment, with a
required reviewer on `production`.

### Environment isolation — how far to take it

- Minimum (this repo): one AWS account, env in every resource/secret name + stack name.
- Better for real production: a **separate AWS account per environment**, so a dev
  mistake can't reach prod data. CDK supports this via the `env: { account, region }`
  you already see in `bin/app.ts`.

## Endpoints

- `GET /prefill/{id}` — cache -> vendor (circuit breaker) -> persist. Returns an `ETag`
  (the record version). 200 / 400 / 502.
- `POST /prefill` — create a record (starts at version 1). Create-only conditional write
  (`attribute_not_exists(pk)`), so a duplicate id returns 409 instead of overwriting. 201 / 400 / 409.
- `PUT /prefill/{id}` — full replace with **optimistic concurrency**. Requires an `If-Match`
  header carrying the version last seen (or `*` for any existing version); the write is a single
  conditional `UpdateItem` that checks the version and atomically bumps it. 200 / 400 / 404 / 412 / 428.
- `DELETE /prefill/{id}` — delete; `If-Match` optional (when present, version-checked). 204 / 404 / 412.

Optimistic concurrency uses one conditional write, not a read-then-write: the update/delete is
conditional on the record existing and the version matching, and
`ReturnValuesOnConditionCheckFailure` lets the repository tell "not found" (404) apart from
"version conflict" (412) without a second call.

Request bodies are validated in two layers from a single source of truth: **zod** schemas
(`src/domain/schemas.ts`) parse the body in the handler, and the same schemas are converted with
`z.toJSONSchema()` into API Gateway request models, so malformed requests are rejected at the
edge (400) before a Lambda is ever invoked.

## Observability

When the vendor circuit breaker opens, the Lambda emits a `VendorPrefill/VendorCircuitOpen`
metric via **Embedded Metric Format** (a structured log line CloudWatch auto-extracts — no
`PutMetricData` call, no extra IAM). The stack wires a CloudWatch **alarm** on that metric to an
SNS topic, plus a **dashboard** showing circuit opens and per-function Lambda errors. To use
DataDog instead, add the DataDog Lambda extension layer and `DD_*` env vars, or forward the EMF
metrics — the emit point (`src/lib/metrics.ts`) stays the same.

## What to extend next

- Subscribe a real endpoint (email / PagerDuty / Slack) to the alarm SNS topic.
- Add `PATCH` for partial updates, and pagination / a `list` access pattern (needs a GSI).
- Wire DataDog APM via the Lambda extension layer.

## Docs

Project documentation lives in [`docs/`](docs/):

- [`docs/onboarding/`](docs/onboarding/) — prerequisites, one-time account setup, and how to deploy.
- [`docs/architecture/`](docs/architecture/) — target architecture and the trust boundary.
- [`docs/adr/`](docs/adr/) — architecture decision records.
- [`docs/review/`](docs/review/) — production-readiness review and the phased improvement plan.
