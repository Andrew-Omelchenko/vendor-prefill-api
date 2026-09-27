# 21. Encrypt the table with a customer-managed KMS key; deletion protection in prod

- Status: Accepted
- Date: 2026-09-24
- Refines: ADR-0004

## Context

The table stores PII and was encrypted with the AWS-owned default key, which is not auditable or
rotatable by the account and produces no explicit grant trail. Nothing prevented accidental deletion
of the production table.

## Decision

Encrypt the table with a customer-managed KMS key (CMK) with automatic rotation enabled; the
function grants (`grantReadWriteData` / `grantWriteData`) extend to the key, so each function's use
of it is explicit and least-privilege per function. Enable DynamoDB deletion protection in prod
(with RETAIN), while lower environments keep it off with DESTROY so stacks tear down cleanly —
consistent with the existing PITR/WAF gating.

## Consequences

- Encryption is auditable and rotatable, and key usage is visible in the IAM grants.
- The prod table cannot be deleted without first disabling protection; the CMK adds a small monthly
  cost.
- The CDK KMS grants introduce action-name wildcards (kms:ReEncrypt*, kms:GenerateDataKey*) scoped
  to this key, recorded as documented cdk-nag suppressions (ADR-0018).
