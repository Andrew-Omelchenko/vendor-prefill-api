# 7. Per-environment config via CDK context

- Status: Accepted (runtime-env weakness addressed by ADR-0014)
- Date: 2026-09-24

## Context

dev, staging, and prod differ in sizing, endpoints, throttling limits, and identity provider.

## Decision

Keep non-secret configuration in `config/index.ts`, keyed by environment, and select it at deploy
time with `cdk deploy -c env=<env>`. Stack and resource names carry the environment.

## Consequences

- One place captures environment differences; environments cannot collide; the config is safe to
  commit.
- Several runtime modules still read values directly from `process.env` with unsafe casts; a
  validated runtime-config module is planned (Phase 1 in the review).
