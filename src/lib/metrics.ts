import { observabilityConfig } from './runtime-config';
import { METRIC_NAMESPACE, CIRCUIT_OPEN_METRIC } from './metric-names';

// CloudWatch auto-extracts a metric from any log line in Embedded Metric Format,
// so this needs no PutMetricData call and no extra IAM.
export function emitMetric(name: string, value: number, unit = 'Count'): void {
  console.log(
    JSON.stringify({
      _aws: {
        Timestamp: Date.now(),
        CloudWatchMetrics: [
          {
            Namespace: METRIC_NAMESPACE,
            Dimensions: [['service']],
            Metrics: [{ Name: name, Unit: unit }],
          },
        ],
      },
      service: observabilityConfig().serviceName,
      [name]: value,
    }),
  );
}

export function emitCircuitOpen(): void {
  emitMetric(CIRCUIT_OPEN_METRIC, 1);
}
