# 19. Test taxonomy (unit / component / integration / smoke) and a coverage gate

- Status: Accepted
- Date: 2026-09-24
- Refines: ADR-0013

## Context

The suite mixed levels: what was labelled "integration" actually wired the handlers in-process
with a mocked SDK, and there was no test against a real DynamoDB API surface, no deployed-stage
check, and no coverage floor to stop regressions.

## Decision

Split tests by level, each with a clear boundary:

- **unit** (`test/unit`): a single module with plain fakes (DI factories); no I/O.
- **component** (`test/component`): the real handlers + service + repository wired together and
  driven over HTTP (supertest), with DynamoDB mocked and the vendor stubbed — the in-process suite
  that used to be mislabelled "integration".
- **integration** (`test/integration`): the repository against a real DynamoDB API via dynalite (an
  in-process clone — no Docker/Java), exercising conditional writes on the wire. Runs in CI.
- **smoke** (`test/smoke`): a deployed-stage check, opt-in via `SMOKE_BASE_URL`/`SMOKE_TOKEN`
  (`npm run test:smoke`), skipped otherwise; intended for a post-deploy CD step.

A coverage gate (`test:coverage`, run in CI) enforces global thresholds; the composition root
(`src/entry`) is excluded from coverage because it is cold-start wiring exercised at deploy time.

## Consequences

- Each level fails for one reason, so a red test points at the right layer.
- dynalite gives a real-wire integration test with no external services, but does not return the old
  item on a failed condition, so the VersionConflict-vs-NotFound distinction stays a unit concern.
- The coverage floor blocks silent regressions without demanding 100%.
