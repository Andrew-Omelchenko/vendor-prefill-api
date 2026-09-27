# 17. Propagate a request correlation id via AsyncLocalStorage

- Status: Accepted
- Date: 2026-09-24

## Context

Log lines from a single request could not be tied together, and there was no way to correlate a
request across service boundaries. Threading a per-request logger through every function signature
(handler -> service -> adapter) would be invasive and easy to forget.

## Decision

Establish a correlation id at the edge of each request in a wrapper (`withRequestContext`): use an
inbound `x-correlation-id` header when present (cross-service tracing), otherwise the API Gateway
request id. Store it in an `AsyncLocalStorage` context that stays active for the whole async call
tree, and have the structured logger read it on every emit — so handler, service, and adapter logs
all carry the same `correlationId` with no plumbing. The id is echoed back in the response
`x-correlation-id` header, and one structured line per request records method, path, status, and
latency. The `Logger` port also gains `child()` for binding static fields. Unhandled errors are
logged with name, message, and stack.

## Consequences

- Every log line is correlatable, and callers can pass an id through for distributed tracing.
- The logger depends on an ambient context rather than being fully pure; this is contained to the
  logging module and covered by tests that assert propagation.
- API Gateway access logs (added alongside) provide an infrastructure-side record independent of the
  function logs.
