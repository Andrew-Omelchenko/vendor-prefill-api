# 24. Use an in-process fake vendor when VENDOR_BASE_URL is unset

- Status: Accepted
- Date: 2026-09-24
- Refines: ADR-0005, ADR-0007

## Context

The GET path reads through a cache to an external vendor. Local runs and a throwaway dev stack often
have no real vendor to call, which left the dev environment pointing at a fictional URL whose
requests could only fail. Developers still want to exercise the full read path.

## Decision

Make `VENDOR_BASE_URL` (and its API-key secret) optional. When both are set, the composition root
builds the real HTTP vendor client behind the circuit breaker; when they are absent, it builds an
in-process fake vendor that returns in-contract records with no network call. The fake is a tiny
no-dependency generator — deterministic per id via an FNV-1a hash, with `riskScore` inside the domain
bound — so it adds nothing meaningful to the deployed bundle and never ships a dev tool as a
production dependency. The dev environment omits the vendor URL and so is self-contained; staging and
prod keep real vendor URLs. The stack sets vendor env and grants the secret only when a real vendor
is configured.

## Consequences

- The dev stack stands up and serves the GET path with no upstream; local development needs no vendor.
- Test suites still inject their own vendor fakes directly (the DI factories), so this fallback is a
  runtime convenience, not a test mechanism.
- For richer, varied test fixtures, a library like faker belongs as a dev dependency in a seeded
  fixture builder — deliberately not bundled into the Lambda at runtime.
