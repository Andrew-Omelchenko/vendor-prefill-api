import { redactPii, safeRecord } from '../../src/lib/redact';

describe('redactPii', () => {
  it('masks PII and secret-ish keys case-insensitively, keeps the rest', () => {
    const out = redactPii({
      id: '1',
      fullName: 'Ada',
      riskScore: 90,
      Authorization: 'Bearer x',
      ms: 12,
    });
    expect(out).toEqual({
      id: '1',
      fullName: '[redacted]',
      riskScore: '[redacted]',
      Authorization: '[redacted]',
      ms: 12,
    });
  });
});

describe('safeRecord', () => {
  it('projects to non-PII fields only', () => {
    const safe = safeRecord({
      id: '1',
      fullName: 'Ada',
      riskScore: 90,
      source: 'vendor',
      cachedAt: 't',
      version: 2,
    });
    expect(safe).toEqual({ id: '1', source: 'vendor', cachedAt: 't', version: 2 });
    expect(safe).not.toHaveProperty('fullName');
    expect(safe).not.toHaveProperty('riskScore');
  });
});
