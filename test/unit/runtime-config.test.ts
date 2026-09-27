describe('runtime-config', () => {
  const ORIGINAL = process.env;

  beforeEach(() => {
    jest.resetModules(); // fresh memoization per case
    process.env = { ...ORIGINAL };
  });
  afterAll(() => {
    process.env = ORIGINAL;
  });

  it('parses valid database config and applies the TTL default', async () => {
    process.env.TABLE_NAME = 'my-table';
    delete process.env.CACHE_TTL_SECONDS;
    const { dbConfig } = await import('../../src/lib/runtime-config');
    expect(dbConfig()).toEqual({ tableName: 'my-table', cacheTtlSeconds: 3600 });
  });

  it('coerces numeric env vars from strings', async () => {
    process.env.TABLE_NAME = 'my-table';
    process.env.CACHE_TTL_SECONDS = '120';
    const { dbConfig } = await import('../../src/lib/runtime-config');
    expect(dbConfig().cacheTtlSeconds).toBe(120);
  });

  it('throws a clear, labelled error when a required var is missing', async () => {
    delete process.env.TABLE_NAME;
    const { dbConfig } = await import('../../src/lib/runtime-config');
    expect(() => dbConfig()).toThrow(/database configuration/i);
  });

  it('rejects an invalid JWKS URI', async () => {
    process.env.JWT_ISSUER = 'iss';
    process.env.JWT_AUDIENCE = 'aud';
    process.env.JWKS_URI = 'not-a-url';
    const { authConfig } = await import('../../src/lib/runtime-config');
    expect(() => authConfig()).toThrow(/auth configuration/i);
  });

  it('maps vendor config and applies breaker defaults', async () => {
    process.env.VENDOR_BASE_URL = 'https://vendor.example';
    process.env.VENDOR_API_KEY_SECRET_NAME = 'vendor/key';
    delete process.env.VENDOR_TIMEOUT_MS;
    const { vendorConfig } = await import('../../src/lib/runtime-config');
    expect(vendorConfig()).toMatchObject({
      baseUrl: 'https://vendor.example',
      apiKeySecretName: 'vendor/key',
      errorThresholdPercentage: 50,
      resetTimeoutMs: 15000,
    });
  });

  it('maps valid auth config', async () => {
    process.env.JWT_ISSUER = 'iss';
    process.env.JWT_AUDIENCE = 'aud';
    process.env.JWKS_URI = 'https://issuer.example/.well-known/jwks.json';
    const { authConfig } = await import('../../src/lib/runtime-config');
    expect(authConfig()).toEqual({
      issuer: 'iss',
      audience: 'aud',
      jwksUri: 'https://issuer.example/.well-known/jwks.json',
    });
  });

  it('applies the secrets cache TTL default', async () => {
    delete process.env.SECRET_CACHE_TTL_MS;
    const { secretsConfig } = await import('../../src/lib/runtime-config');
    expect(secretsConfig()).toEqual({ cacheTtlMs: 300000 });
  });
});
