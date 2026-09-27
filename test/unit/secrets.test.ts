import { mockClient } from 'aws-sdk-client-mock';
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';
import { createSecretsProvider } from '../../src/lib/secrets';

const smMock = mockClient(SecretsManagerClient);
const client = new SecretsManagerClient({});

describe('secrets provider', () => {
  beforeEach(() => smMock.reset());

  it('caches within the TTL and refetches after it expires', async () => {
    let clock = 0;
    const provider = createSecretsProvider({ client, cacheTtlMs: 1000, now: () => clock });
    smMock.on(GetSecretValueCommand).resolves({ SecretString: 'v1' });

    expect(await provider.getSecret('k')).toBe('v1');
    expect(await provider.getSecret('k')).toBe('v1');
    expect(smMock.commandCalls(GetSecretValueCommand)).toHaveLength(1);

    clock = 2000; // past the 1000ms TTL
    smMock.on(GetSecretValueCommand).resolves({ SecretString: 'v2' });

    expect(await provider.getSecret('k')).toBe('v2');
    expect(smMock.commandCalls(GetSecretValueCommand)).toHaveLength(2);
  });
});

describe('secrets provider — failure path', () => {
  it('throws when the secret has no string value', async () => {
    smMock.reset();
    smMock.on(GetSecretValueCommand).resolves({}); // no SecretString
    const provider = createSecretsProvider({ client, cacheTtlMs: 1000, now: () => 0 });
    await expect(provider.getSecret('missing')).rejects.toThrow(/no string value/i);
  });
});
