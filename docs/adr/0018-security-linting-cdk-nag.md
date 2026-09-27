# 18. Security-lint the infrastructure with cdk-nag

- Status: Accepted
- Date: 2026-09-24

## Context

Infrastructure mistakes (missing logging, over-broad IAM, unencrypted transport) are easy to
introduce and hard to catch in review. There was no automated check on the synthesized template.

## Decision

Apply cdk-nag's `AwsSolutionsChecks` as an aspect in `bin/app.ts`, so findings become synth errors
and fail CI (both the dev and prod synth run). Address findings rather than blanket-suppress:
enable API Gateway access logs and method logging (payloads off, to avoid logging PII), enforce TLS
on the SNS alarm topic, and keep per-function IAM least-privilege. Where a finding reflects a
deliberate, defensible choice, record an evidence-based suppression in the stack: AWS-managed
logging policies and X-Ray's mandatory `Resource:*`, the custom Lambda JWT authorizer instead of
Cognito (ADR-0012), body validation on mutating methods plus zod in every Lambda, and the
cost-driven prod-gating of WAF and PITR.

## Consequences

- Security regressions in the template fail the build with a specific rule and reason.
- Suppressions are visible in the stack with justifications, so exceptions are auditable rather than
  hidden.
- The check runs on every synth, adding a little synth time.
