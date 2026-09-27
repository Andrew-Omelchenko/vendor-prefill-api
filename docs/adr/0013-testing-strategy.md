# 13. Testing strategy: mock the SDK, component-test handlers

- Status: Accepted (taxonomy + coverage gate refined by ADR-0019)
- Date: 2026-09-24

## Context

Serverless tests are slow and flaky if they always reach real infrastructure, but pure logic tests
alone miss wiring mistakes.

## Decision

Unit-test the domain and repository with the AWS SDK mocked (`aws-sdk-client-mock`), asserting the
exact commands sent. Drive handlers in-process with Supertest for component tests. Treat true
integration (LocalStack or a deployed stage) as a later addition.

## Consequences

- Fast, deterministic tests with no I/O that catch wiring bugs such as a wrong condition expression.
- These tests do not exercise real API Gateway mapping, the edge validator, or authentication;
  higher-fidelity integration and smoke tests are tracked in the review.
