import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { SecretsManagerClient } from '@aws-sdk/client-secrets-manager';
import { createPrefillRepository } from '../clients/prefill-repository';
import { createVendorClient } from '../clients/vendor-client';
import { createFakeVendorClient } from '../clients/fake-vendor-client';
import { createSecretsProvider } from '../lib/secrets';
import { createPrefillService, type PrefillService } from '../domain/prefill-service';
import { logger } from '../lib/logger';
import { emitCircuitOpen } from '../lib/metrics';
import { dbConfig, secretsConfig, vendorConfig } from '../lib/runtime-config';
import type { VendorClient } from '../domain/ports';

const clock = () => new Date();

function buildRepository() {
  const { tableName, cacheTtlSeconds } = dbConfig();
  const doc = DynamoDBDocumentClient.from(new DynamoDBClient({}));
  return createPrefillRepository({ doc, tableName, cacheTtlSeconds, now: clock });
}

function buildSecrets() {
  const { cacheTtlMs } = secretsConfig();
  return createSecretsProvider({ client: new SecretsManagerClient({}), cacheTtlMs, now: Date.now });
}

function buildVendorClient(): VendorClient {
  const cfg = vendorConfig();
  // Real vendor only when a base URL and its API-key secret are configured;
  // otherwise fall back to the in-process fake (self-contained dev/local).
  if (cfg.baseUrl && cfg.apiKeySecretName) {
    return createVendorClient({
      secrets: buildSecrets(),
      logger,
      onCircuitOpen: emitCircuitOpen,
      config: {
        baseUrl: cfg.baseUrl,
        apiKeySecretName: cfg.apiKeySecretName,
        timeoutMs: cfg.timeoutMs,
        errorThresholdPercentage: cfg.errorThresholdPercentage,
        resetTimeoutMs: cfg.resetTimeoutMs,
      },
    });
  }
  logger.info('vendor base URL not configured; using the fake vendor client');
  return createFakeVendorClient({ logger });
}

// GET path: real vendor client (parses vendor config on this function only).
export function buildServiceWithVendor(): PrefillService {
  return createPrefillService({
    repository: buildRepository(),
    vendor: buildVendorClient(),
    logger,
    now: clock,
  });
}

// Write paths (POST/PUT/DELETE) never call the vendor, so they get a stub that
// throws if called — avoiding vendor config those functions don't carry.
const noVendor: VendorClient = {
  getVendorRecord: () => {
    throw new Error('vendor client is not available in this function');
  },
};

export function buildServiceWriteOnly(): PrefillService {
  return createPrefillService({
    repository: buildRepository(),
    vendor: noVendor,
    logger,
    now: clock,
  });
}
