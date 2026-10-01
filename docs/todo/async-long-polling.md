# Async long-running work: request–reply with long polling via a reverse proxy

Status: planned. When implemented, this becomes ADR-0027.

## The problem

API Gateway bounds how long a synchronous integration may run. For REST APIs the integration
timeout was historically a hard **29 seconds** (raisable via a service-quota request since mid-2024;
HTTP APIs still cap at 30s). Independent of the exact number, holding a Lambda open for tens of
seconds per request is costly, ties up concurrency, and fails badly under load. So any operation
that _can_ exceed the window must not run on the synchronous request path.

The target pattern is **async request–reply with polling, hidden behind a reverse proxy / BFF** so
the client logic stays trivial: the proxy holds the caller's request for a bounded interval, polls a
status endpoint internally, and returns the result when ready or a "not ready" status otherwise. The
client simply retries on "not ready".

## Where the app is today

The current read path is synchronous and comfortably inside the window: a cache hit returns
immediately, and a cache miss calls the vendor bounded by the circuit breaker's timeout (a few
seconds) with a null fallback. Nothing today can approach 29s, so this pattern is **not required as
built**. It becomes necessary if the backend work can grow — a slow vendor, multi-step enrichment,
or a batch "prefill computation". This document is the plan for that case; it is additive, not a
rewrite.

## The pattern

1. **Trigger returns fast.** A request to start work writes a record with status `PENDING` and
   starts the slow work _off_ the request path, then returns **202 Accepted** with a status location
   — well inside the timeout.
2. **A worker does the slow part.** A separate, asynchronously invoked Lambda (async invocation is
   not behind the 29s limit; it may run up to 15 minutes) performs the slow call and writes `READY`
   plus the result, or `FAILED` plus a reason.
3. **A status endpoint reports progress.** `GET /prefill/{id}` returns **404** (unknown), **202/204**
   (pending), **200** (ready, with the record), or a **4xx/5xx** (failed).
4. **The reverse proxy hides the loop.** The proxy holds the client request for a bounded interval
   (for example ~25s), polls the status endpoint internally, and returns **200** when the work
   finishes or **204** when it has not — so the client's only logic is "call; on 204, call again."
   In the target architecture this is **ApigeeX** (the enterprise gateway already in front of the
   API) with a hold/poll policy, or a small BFF.

## How the codebase supports it

The hexagonal layout makes this additive — new ports and a new entry point, no change to the domain
rules:

- **Status in the record.** The DynamoDB table is already the shared coordination store used by the
  cache. Add a `status` field (`PENDING | READY | FAILED`) alongside `cachedAt`/`version`. The worker
  writes it; the status endpoint reads it.
- **A job/status port + adapter.** Either extend `PrefillRepository` or add a `JobRepository` port in
  `src/domain/ports.ts` with a DynamoDB adapter in `src/clients/`. The service orchestrates
  "start work" vs "read status" behind the interface, testable with plain fakes.
- **A worker entry point.** Add `src/entry/refresh-worker.ts` (a new composition + handler) wired by
  CDK as a separate function, invoked asynchronously (direct async invoke, or via SQS / Step
  Functions for retries, backoff, and a dead-letter queue). **The circuit breaker moves into the
  worker**, so a slow or failing vendor no longer blocks any synchronous request.
- **Tracing across the async boundary.** Pass the correlation id (ADR-0017) from the trigger to the
  worker (e.g. in the invocation payload or message attributes) so a request stays traceable end to
  end even though it spans two Lambdas.
- **Idempotency.** The trigger must be idempotent so repeated polls or retries do not spawn duplicate
  work — this depends on the idempotency item already in the roadmap (an `Idempotency-Key` or a
  conditional `PENDING` write that no-ops if a job is already in flight).

## Trade-offs

- **Long polling is the simplest client** but it **holds connections**, consuming concurrency and
  cost; it does not scale to many slow, concurrent waiters.
- **Push alternatives** avoid held connections: API Gateway **WebSocket** APIs, **server-sent
  events**, or **webhooks** deliver the result instead of being polled. The backend (async worker +
  status in DynamoDB) is identical; only the delivery mechanism to the client changes.
- The honest framing: keep the async request–reply backend, and choose **long-polling via proxy for
  simple clients**, or **push** when connection cost or latency matters.

## Testing

- Unit: the service returns `PENDING` on start, transitions to `READY`/`FAILED` as the worker writes
  status; status reads map to the right HTTP codes (404/204/200/error).
- Component: trigger → status polling driven through the handlers with the worker faked.
- A deployed-stage check that a slow operation returns 202 quickly and later reports 200, confirming
  nothing blocks on the 29s path.

## Related decisions

- ADR-0005 — vendor resilience (the circuit breaker, which moves into the worker).
- ADR-0015 — factory-based DI with ports (the status port and worker drop in behind interfaces).
- ADR-0017 — request correlation (propagated across the async boundary).
- Roadmap: idempotent writes (a prerequisite for a safe trigger).

Implementing this should add **ADR-0027** recording the async request–reply decision, the status
model, and the long-polling-vs-push choice.
