# Architecture decision records

These records capture the significant technical decisions behind `vendor-prefill-api`, using the
lightweight format popularized by Michael Nygard: context → decision → consequences. They were
recorded on 2026-09-24 to document choices made from the start of the project. New decisions should
be added as further numbered records; when a decision changes, add a new record and mark the old
one superseded rather than editing history.

Status values: Proposed · Accepted · Superseded by ADR-N · Deprecated.

| ADR                                                          | Title                                                              | Status   |
| ------------------------------------------------------------ | ------------------------------------------------------------------ | -------- |
| [0001](0001-serverless-on-aws-with-cdk.md)                   | Serverless architecture on AWS with CDK                            | Accepted |
| [0002](0002-layered-architecture-aws-free-domain.md)         | Layered architecture with an AWS-free domain core                  | Accepted |
| [0003](0003-function-per-route-least-privilege.md)           | Function per route with least-privilege IAM                        | Accepted |
| [0004](0004-dynamodb-single-table-ttl.md)                    | Single DynamoDB table for cache and durable records                | Accepted |
| [0005](0005-vendor-call-resilience.md)                       | Circuit breaker and timeouts for vendor calls                      | Accepted |
| [0006](0006-secrets-by-reference.md)                         | Secrets by reference, not owned by the app stack                   | Accepted |
| [0007](0007-per-environment-config.md)                       | Per-environment config via CDK context                             | Accepted |
| [0008](0008-zod-single-source-validation.md)                 | zod as the single source of truth for validation                   | Accepted |
| [0009](0009-optimistic-concurrency.md)                       | Optimistic concurrency via conditional writes                      | Accepted |
| [0010](0010-observability-emf.md)                            | Observability via EMF metrics, alarm, and dashboard                | Accepted |
| [0011](0011-cicd-github-oidc.md)                             | CI/CD with GitHub OIDC and a separate bootstrap stack              | Accepted |
| [0012](0012-edge-jwt-authorizer.md)                          | Edge authentication via a JWT Lambda authorizer                    | Accepted |
| [0013](0013-testing-strategy.md)                             | Testing strategy: mock the SDK, component-test handlers            | Accepted |
| [0014](0014-validated-runtime-config.md)                     | Validated runtime configuration module                             | Accepted |
| [0015](0015-factory-based-dependency-injection.md)           | Factory-based dependency injection with ports                      | Accepted |
| [0016](0016-generate-openapi-from-zod.md)                    | Generate the OpenAPI spec from the zod schemas                     | Accepted |
| [0017](0017-request-correlation-async-local-storage.md)      | Propagate a request correlation id via AsyncLocalStorage           | Accepted |
| [0018](0018-security-linting-cdk-nag.md)                     | Security-lint the infrastructure with cdk-nag                      | Accepted |
| [0019](0019-test-taxonomy-and-coverage-gate.md)              | Test taxonomy (unit/component/integration/smoke) + coverage gate   | Accepted |
| [0020](0020-field-constraints-and-pii-redaction.md)          | Field-level constraints + PII/sensitive-data logging policy        | Accepted |
| [0021](0021-customer-managed-kms-and-deletion-protection.md) | Customer-managed KMS key + deletion protection                     | Accepted |
| [0022](0022-no-cors-by-default.md)                           | No CORS by default (server-to-server API)                          | Accepted |
| [0023](0023-configurable-auth-idp-or-cognito.md)             | Configurable auth: external-IdP JWT authorizer or Cognito fallback | Accepted |
| [0024](0024-fake-vendor-when-unconfigured.md)                | Use an in-process fake vendor when VENDOR_BASE_URL is unset        | Accepted |
