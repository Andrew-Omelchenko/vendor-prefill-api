import { GetSecretValueCommand, type SecretsManagerClient } from '@aws-sdk/client-secrets-manager';
import type { SecretsProvider } from '../domain/ports';

export interface SecretsProviderDeps {
  client: SecretsManagerClient;
  cacheTtlMs: number;
  now: () => number;
}

export function createSecretsProvider(deps: SecretsProviderDeps): SecretsProvider {
  const { client, cacheTtlMs, now } = deps;
  const cache = new Map<string, { value: string; expiresAt: number }>();

  return {
    async getSecret(name) {
      const hit = cache.get(name);
      if (hit && hit.expiresAt > now()) return hit.value;

      const res = await client.send(new GetSecretValueCommand({ SecretId: name }));
      if (!res.SecretString) {
        throw new Error(`Secret "${name}" has no string value`);
      }
      cache.set(name, { value: res.SecretString, expiresAt: now() + cacheTtlMs });
      return res.SecretString;
    },
  };
}
