# 1. Serverless architecture on AWS with CDK

- Status: Accepted
- Date: 2026-09-24

## Context

The project modernizes a legacy Java/Spring/BPM system toward a decoupled, elastic, low-operations
platform for integration-heavy, spiky workloads (third-party data prefill). The priorities are
pay-per-use scaling, low idle cost, and fast iteration.

## Decision

Build the API from serverless components — AWS API Gateway (REST) + AWS Lambda (Node.js/TypeScript)

- DynamoDB — and provision everything as code with AWS CDK in TypeScript.

## Consequences

- Automatic scaling, low idle cost, one language across application and infrastructure, and
  reproducible environments.
- Cold starts matter on latency-sensitive paths; the system carries more distributed-systems
  complexity than a monolith.
- Coupling to AWS is accepted, and mitigated by keeping the domain layer AWS-free (ADR-0002).
