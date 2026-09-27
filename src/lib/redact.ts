import type { PrefillRecord } from '../domain/types';

// PII / sensitive-data logging policy.
// A prefill record contains PII (fullName) and sensitive data (riskScore); these
// must never be written to logs. As defense in depth, the logger passes its
// metadata through this denylist so a stray log call cannot leak them. When a
// record genuinely needs to appear in a log line, use safeRecord() instead.
const DENY = new Set([
  'fullname',
  'riskscore',
  'authorization',
  'apikey',
  'api_key',
  'accesskey',
  'password',
  'secret',
  'token',
  'ssn',
]);

export function redactPii(meta: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(meta)) {
    out[key] = DENY.has(key.toLowerCase()) ? '[redacted]' : value;
  }
  return out;
}

// A log-safe projection of a record: identifiers and metadata only, no PII.
export function safeRecord(
  record: PrefillRecord,
): Pick<PrefillRecord, 'id' | 'source' | 'cachedAt' | 'version'> {
  return {
    id: record.id,
    source: record.source,
    cachedAt: record.cachedAt,
    version: record.version,
  };
}
