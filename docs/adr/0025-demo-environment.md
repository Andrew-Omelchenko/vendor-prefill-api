# 25. A demonstration environment: open, mock data, no secrets

- Status: Accepted
- Date: 2026-09-24
- Refines: ADR-0007, ADR-0023, ADR-0024

## Context

Demonstrations and evaluations need an environment anyone can call without provisioning tokens,
identity, or vendor credentials — but doing that in dev/staging/prod would weaken real
environments.

## Decision

Add a `demo` environment that composes existing config-driven switches plus one new flag:

- `disableAuth: true` — the stack attaches no authorizer; the API is public
  (`AuthorizationType.NONE`).
- no `vendorBaseUrl` / secret — the GET path serves generated mock data via the fake vendor
  (ADR-0024); no Secrets Manager access exists.
- ephemeral — as a non-prod env it uses DESTROY removal, no deletion protection, and no PITR.

This is safe precisely because the environment holds no secrets and no real data. It is still bounded
by stage throttling (set conservatively, since it is world-reachable), and the intentional openness is
recorded as a demo-only cdk-nag suppression (AwsSolutions-APIG4) applied only when `disableAuth` is
set, so dev/staging/prod remain strict. CI synthesizes the demo path so the suppression and the
open-API decision stay honest.

## Consequences

- `cdk deploy -c env=demo` (or `npm run deploy:demo`) stands up a public, self-contained API.
- Because it is open, it must never be given real vendor URLs, secrets, or data; the config omits all
  of them by construction.
- A truly public demo may still warrant WAF/rate-limit rules or an API-key usage plan; throttling is
  the baseline here, and WAF remains available (it is prod-gated today and can be extended to demo).
