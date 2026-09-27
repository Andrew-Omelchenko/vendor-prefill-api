# 10. Observability via EMF metrics, alarm, and dashboard

- Status: Accepted
- Date: 2026-09-24

## Context

The circuit breaker opening is an early signal that a vendor is failing and should raise an alert
before customers notice.

## Decision

Emit custom metrics from Lambda using CloudWatch Embedded Metric Format — a structured log line
CloudWatch extracts into a metric — avoiding a synchronous `PutMetricData` call and the matching IAM
permission. A CloudWatch alarm on the circuit-open metric notifies an SNS topic; a dashboard shows
opens and per-function errors.

## Consequences

- No API call on the hot path and no extra IAM; the alarm and dashboard are defined as code.
- The metric name is currently declared in both the emitter and the stack and can drift (noted for
  Phase 1); dashboards live in the application stack.
