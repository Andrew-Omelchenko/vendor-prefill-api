// Shared by the metric emitter (src) and the CloudWatch alarm/dashboard (CDK),
// so the alarm can never silently stop matching the emitted metric.
export const METRIC_NAMESPACE = 'VendorPrefill';
export const CIRCUIT_OPEN_METRIC = 'VendorCircuitOpen';
