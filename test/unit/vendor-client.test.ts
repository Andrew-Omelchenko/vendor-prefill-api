import { createVendorClient } from '../../src/clients/vendor-client';
import type { Logger, SecretsProvider } from '../../src/domain/ports';

const noopLogger: Logger = {
  debug() {},
  info() {},
  warn() {},
  error() {},
  child: () => noopLogger,
};
const secrets: SecretsProvider = { getSecret: async () => 'test-key' };
const config = {
  baseUrl: 'https://vendor.test',
  apiKeySecretName: 'k',
  timeoutMs: 3000,
  errorThresholdPercentage: 50,
  resetTimeoutMs: 15000,
};

describe('vendor-client', () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('returns the payload on a successful response', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: '1', fullName: 'Ada', riskScore: 5, source: 'vendor' }),
    }) as unknown as typeof fetch;
    const client = createVendorClient({
      secrets,
      logger: noopLogger,
      onCircuitOpen: () => {},
      config,
    });
    expect((await client.getVendorRecord('1'))?.id).toBe('1');
  });

  it('degrades to null when the vendor errors (breaker fallback)', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValue({ ok: false, status: 500 }) as unknown as typeof fetch;
    const client = createVendorClient({
      secrets,
      logger: noopLogger,
      onCircuitOpen: () => {},
      config,
    });
    expect(await client.getVendorRecord('2')).toBeNull();
  });
});
