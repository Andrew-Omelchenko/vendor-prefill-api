import { z } from 'zod';

// Memoize each config slice so process.env is parsed once per cold start.
function once<T>(fn: () => T): () => T {
  let holder: { v: T } | null = null;
  return () => (holder ??= { v: fn() }).v;
}

function load<T>(schema: z.ZodType<T>, label: string): T {
  const result = schema.safeParse(process.env);
  if (!result.success) {
    const detail = result.error.issues
      .map((i) => `${i.path.join('.') || '(env)'}: ${i.message}`)
      .join('; ');
    throw new Error(`Invalid ${label} configuration: ${detail}`);
  }
  return result.data;
}

// Each slice validates only the variables its consumers need, so a function that
// doesn't carry (say) vendor env never fails on it.
const dbSchema = z.object({
  TABLE_NAME: z.string().min(1),
  CACHE_TTL_SECONDS: z.coerce.number().int().positive().default(3600),
});
export const dbConfig = once(() => {
  const e = load(dbSchema, 'database');
  return { tableName: e.TABLE_NAME, cacheTtlSeconds: e.CACHE_TTL_SECONDS };
});

const vendorSchema = z.object({
  VENDOR_BASE_URL: z.url().optional(),
  VENDOR_API_KEY_SECRET_NAME: z.string().min(1).optional(),
  VENDOR_TIMEOUT_MS: z.coerce.number().int().positive().default(3000),
  VENDOR_ERROR_THRESHOLD_PCT: z.coerce.number().int().min(1).max(100).default(50),
  VENDOR_RESET_TIMEOUT_MS: z.coerce.number().int().positive().default(15000),
});
export const vendorConfig = once(() => {
  const e = load(vendorSchema, 'vendor');
  return {
    baseUrl: e.VENDOR_BASE_URL,
    apiKeySecretName: e.VENDOR_API_KEY_SECRET_NAME,
    timeoutMs: e.VENDOR_TIMEOUT_MS,
    errorThresholdPercentage: e.VENDOR_ERROR_THRESHOLD_PCT,
    resetTimeoutMs: e.VENDOR_RESET_TIMEOUT_MS,
  };
});

const authSchema = z.object({
  JWT_ISSUER: z.string().min(1),
  JWT_AUDIENCE: z.string().min(1),
  JWKS_URI: z.url(),
});
export const authConfig = once(() => {
  const e = load(authSchema, 'auth');
  return { issuer: e.JWT_ISSUER, audience: e.JWT_AUDIENCE, jwksUri: e.JWKS_URI };
});

const secretsSchema = z.object({
  SECRET_CACHE_TTL_MS: z.coerce.number().int().positive().default(300000),
});
export const secretsConfig = once(() => {
  const e = load(secretsSchema, 'secrets');
  return { cacheTtlMs: e.SECRET_CACHE_TTL_MS };
});

const observabilitySchema = z.object({
  SERVICE_NAME: z.string().min(1).default('vendor-prefill'),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
});
export const observabilityConfig = once(() => {
  const e = load(observabilitySchema, 'observability');
  return { serviceName: e.SERVICE_NAME, logLevel: e.LOG_LEVEL };
});
