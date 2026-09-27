# 4. Single DynamoDB table for cache and durable records

- Status: Accepted (CMK + deletion protection added by ADR-0021)
- Date: 2026-09-24

## Context

The service both caches vendor responses and stores client-created records, and currently has one
access pattern: lookup by id.

## Decision

Use one DynamoDB table with a single partition key. Cache items carry a `ttl` attribute and expire
automatically; durable records omit it and persist. Model from the access pattern rather than
normalizing entities.

## Consequences

- One table to operate; TTL handles cache eviction for free; performance is predictable.
- A genuinely new access pattern requires a GSI or a migration; mixing lifetimes in one table
  requires discipline.
