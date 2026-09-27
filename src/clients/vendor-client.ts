import CircuitBreaker from 'opossum';
import type { Logger, SecretsProvider, VendorClient } from '../domain/ports';
import type { VendorPayload } from '../domain/types';

export interface VendorClientConfig {
  baseUrl: string;
  apiKeySecretName: string;
  timeoutMs: number;
  errorThresholdPercentage: number;
  resetTimeoutMs: number;
}

export interface VendorClientDeps {
  secrets: SecretsProvider;
  logger: Logger;
  onCircuitOpen: () => void;
  config: VendorClientConfig;
}

export function createVendorClient(deps: VendorClientDeps): VendorClient {
  const { secrets, logger, onCircuitOpen, config } = deps;

  const callVendor = async (id: string): Promise<VendorPayload> => {
    const apiKey = await secrets.getSecret(config.apiKeySecretName);
    const res = await fetch(`${config.baseUrl}/records/${id}`, {
      headers: { authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(config.timeoutMs),
    });
    if (!res.ok) throw new Error(`Vendor responded ${res.status}`);
    return (await res.json()) as VendorPayload;
  };

  const breaker = new CircuitBreaker<[string], VendorPayload | null>(callVendor, {
    timeout: config.timeoutMs,
    errorThresholdPercentage: config.errorThresholdPercentage,
    resetTimeout: config.resetTimeoutMs,
  });
  breaker.on('open', () => {
    logger.warn('vendor circuit opened');
    onCircuitOpen();
  });
  breaker.on('halfOpen', () => logger.info('vendor circuit half-open, probing'));
  breaker.fallback(() => null);

  return { getVendorRecord: (id) => breaker.fire(id) };
}
