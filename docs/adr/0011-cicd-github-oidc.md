# 11. CI/CD with GitHub OIDC and a separate bootstrap stack

- Status: Accepted
- Date: 2026-09-24

## Context

Static cloud credentials in CI are a leak vector. The CI deploy role is a bootstrap concern with a
different lifecycle than the application, and cannot be created by the same deploy it enables.

## Decision

GitHub Actions authenticates by assuming an IAM role via OIDC. That role and the OIDC provider are
created by a separate, admin-run bootstrap stack. The role holds only `sts:AssumeRole` on the CDK
bootstrap roles, and its trust is scoped to a specific branch or environment.

## Consequences

- No long-lived keys in CI; a least-privilege deploy identity; the application deploy cannot create
  the role that deploys it.
- An extra one-time admin step, and the deploy role ARN must be placed in a GitHub secret.
