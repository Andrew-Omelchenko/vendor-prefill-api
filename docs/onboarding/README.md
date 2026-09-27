# Onboarding & deployment guide

A guide for a new engineer to build, run, and deploy the service.

## Prerequisites

- Node.js 24+ (`node -v`). The Lambda runtime is `nodejs24.x`, matching local.
- An AWS account and credentials able to deploy: CloudFormation, Lambda, DynamoDB, API Gateway,
  IAM, Secrets Manager, CloudWatch, SNS, WAF, S3. Admin is sufficient for first deploys.
- AWS CLI configured (`aws configure` or SSO).
- Git.

## Local development

```bash
npm ci
npm test           # unit + component tests, no AWS required
npm run lint
npm run format:check
npm run synth      # compile the CDK app to CloudFormation
```

No Docker is required; esbuild bundles the Lambdas locally.

## Configuration model

Two categories, handled separately (see ADR-0006 and ADR-0007):

- **Non-secret config** lives in `config/index.ts`, keyed by environment — region, vendor URL,
  cache TTL, log level, throttling limits, the JWT issuer/audience/JWKS URI, and Lambda sizing.
  The environment is selected at deploy time with `-c env=<env>`.
- **Secrets** live in AWS Secrets Manager, one per environment; the stack references them by name
  only and never stores a value in code or CloudFormation.

Runtime modules read a few values from environment variables that the stack sets on each function.

When `VENDOR_BASE_URL` is unset for an environment (as in dev), the GET path returns generated,
in-contract fake data instead of calling a real vendor, so the stack is self-contained (ADR-0024).

## One-time account setup

Per account/region, before the first deploy:

1. **Bootstrap CDK:** `npx cdk bootstrap aws://<account-id>/<region>` — creates the assets bucket
   and roles CDK deploys through. Deploy fails without it.
2. **Create the vendor secret** per environment:
   `aws secretsmanager create-secret --name vendor-prefill/<env>/vendor-api-key --secret-string '<key>'`
3. **Set real values in `config/index.ts`:** `region`, `vendorBaseUrl`, and the `auth` block
   (`issuer`, `audience`, `jwksUri`) pointing at the identity provider. The authorizer rejects all
   requests until it can validate tokens against a real IdP.

## Deploying

```bash
npm run deploy:dev
npm run deploy:staging
npm run deploy:prod
```

Each deploys the `VendorPrefill-<env>` stack. Prod additionally provisions a WAF web ACL.

## Authentication

Authentication is chosen at deploy time (ADR-0023). Environments configured with an `auth` block use
a Lambda authorizer that validates JWTs from an external IdP; a greenfield or local stack uses a
Cognito user pool instead.

### External IdP (default for configured environments)

Set `auth` (issuer, audience, JWKS URI) for the environment in `config/index.ts`, then deploy
normally — `config.auth` being present selects the Lambda JWT authorizer:

```bash
cdk deploy -c env=dev
```

A caller obtains a JWT from the IdP (typically an OAuth2 client-credentials or authorization-code
flow) and sends it as a bearer token; the authorizer verifies the signature against the IdP's JWKS
and checks issuer, audience, and expiry:

```bash
curl https://<api-id>.execute-api.<region>.amazonaws.com/<stage>/prefill/123 \
  -H "Authorization: Bearer <jwt>"
```

### Cognito fallback (greenfield / local)

Leave `auth` unset for the environment, or force the path explicitly:

```bash
cdk deploy -c env=dev -c authMode=cognito
```

This provisions the user pool and app client (their ids are stack resources; read them from the
CloudFormation outputs or the Cognito console). Create a user once, as an admin:

```bash
aws cognito-idp admin-create-user --user-pool-id <pool-id> --username user@example.com
aws cognito-idp admin-set-user-password --user-pool-id <pool-id> \
  --username user@example.com --password '<Str0ng!Passw0rd>' --permanent
```

The pool requires TOTP MFA and the app client uses SRP, so obtaining a token is a multi-step
sign-in (SRP challenge, then the TOTP challenge) rather than a single CLI call — in practice done
through Amplify Auth, the Cognito Hosted UI, or a small SRP client. Once you have the resulting
**ID token**, send it directly in the `Authorization` header. A Cognito user-pool authorizer expects
the raw token, not a `Bearer ` prefix:

```bash
curl https://<api-id>.execute-api.<region>.amazonaws.com/<stage>/prefill/123 \
  -H "Authorization: <id-token>"
```

## CI/CD setup (recommended)

1. Create the GitHub OIDC provider and a scoped deploy role (admin, once):
   `npm run bootstrap:ci -- -c repo=<owner>/<name>`
   Add `-c environment=production` or `-c gitRef=<branch>` to scope the trust; add
   `-c oidcArn=<arn>` to reuse an existing GitHub OIDC provider.
2. Copy the `DeployRoleArn` output into the repository's `AWS_DEPLOY_ROLE_ARN` secret.
3. Pull requests run lint, tests, format check, and synth; the prod deploy job assumes the role via
   OIDC — no static keys are stored in GitHub.

## Verifying a deployment

- `npm run synth` before deploying catches infrastructure errors early.
- After deploy, calls require a valid bearer token; without one the authorizer returns 401.
- The CloudWatch dashboard `vendor-prefill-<env>` shows circuit-breaker opens and per-function
  errors; alarms publish to the `vendor-prefill-<env>-alarms` SNS topic.

## Troubleshooting

- **Deploy fails immediately** → the account/region is not bootstrapped.
- **GET returns 500** → the vendor secret does not exist for that environment.
- **All requests return 401** → the authorizer cannot validate the token. In external-IdP mode,
  confirm the `auth` config points at a reachable IdP and that callers send `Authorization: Bearer
<jwt>`. In Cognito mode, send the raw ID token in `Authorization` with no `Bearer ` prefix.
- **`npm install` warns about install scripts** → approved native packages are listed under
  `allowScripts` in `package.json`; run `npm install-scripts approve <pkg>` for new ones.
- **`npm audit` / deprecation warnings** → see [review/](../review/) for the triage approach.

## Further reading

- [../architecture/](../architecture/) — how the system works and the trust boundary.
- [../adr/](../adr/) — why the key decisions were made.
- [../review/](../review/) — known gaps and the phased improvement plan.
