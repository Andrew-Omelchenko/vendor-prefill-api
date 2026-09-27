# 6. Secrets by reference, not owned by the app stack

- Status: Accepted
- Date: 2026-09-24

## Context

Vendor API keys are externally issued and long-lived, while the application stack is deployed and
destroyed frequently. A value placed in CDK code would also land in the CloudFormation template.

## Decision

Store secrets in AWS Secrets Manager, one per environment, created out-of-band. The stack references
each by name and grants read access; Lambdas fetch the value at runtime and cache it with a TTL.

## Consequences

- No secret value in git or templates; rotation is independent of deploys; the app stack cannot
  accidentally delete a shared credential.
- Secret creation is a manual/bootstrap step, and the read path fails until the secret exists.
