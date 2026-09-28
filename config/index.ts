// Per-environment, NON-SECRET configuration.
// Safe to commit: nothing here is sensitive. Chosen at deploy time via
// `cdk deploy -c env=<env>`.

export type Env = 'dev' | 'staging' | 'prod' | 'demo';

export interface AppConfig {
  env: Env;
  region: string;
  // When omitted, the GET path uses an in-process fake vendor instead of a real
  // HTTP call, so the stack is self-contained (see ADR-0024).
  vendorBaseUrl?: string;
  cacheTtlSeconds: number;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
  // The Secrets Manager secret NAME the Lambda will read at runtime (real vendor only).
  vendorApiKeySecretName?: string;
  // Optional: when set, this address is subscribed to the alarm SNS topic.
  alarmEmail?: string;
  // JWT authorizer settings (the IdP the caller authenticates against). These are
  // placeholder values pending clarification of the enterprise issuer behind ApigeeX.
  // When omitted, the stack provisions a Cognito user pool as the token issuer
  // instead of the external-IdP Lambda authorizer (see ADR-0023).
  auth?: { issuer: string; audience: string; jwksUri: string };
  // Demonstration mode: attach NO authorizer (the API is publicly callable). Only safe
  // with no secrets and mock vendor data. See ADR-0025.
  disableAuth?: boolean;
  // API Gateway stage throttling.
  throttle: { rateLimit: number; burstLimit: number };
  // Vendor circuit-breaker tuning (passed to the GET function as env).
  circuitBreaker: { timeoutMs: number; errorThresholdPercentage: number; resetTimeoutMs: number };
  // Reserved concurrency for the vendor-calling GET function. Caps upstream
  // fan-out and guarantees the path a floor. Keep well under the account limit.
  concurrency: { getReserved: number };
  lambda: { memorySize: number; timeoutSeconds: number };
  // CORS is OFF by default: this API is consumed server-to-server behind the
  // enterprise gateway, not from browsers. Set allowOrigins only if a browser
  // client is ever introduced (see ADR-0022).
  cors?: { allowOrigins: string[] };
}

const configs: Record<Env, AppConfig> = {
  dev: {
    env: 'dev',
    region: 'eu-central-1',
    // No vendor URL/secret in dev: the GET path serves generated fake data, so the
    // dev stack stands up and works without a real upstream (ADR-0024).
    cacheTtlSeconds: 300,
    logLevel: 'debug',
    auth: {
      issuer: 'https://sandbox-idp.example.com/',
      audience: 'vendor-prefill-dev',
      jwksUri: 'https://sandbox-idp.example.com/.well-known/jwks.json',
    },
    throttle: { rateLimit: 20, burstLimit: 40 },
    circuitBreaker: { timeoutMs: 3000, errorThresholdPercentage: 50, resetTimeoutMs: 15000 },
    concurrency: { getReserved: 5 },
    lambda: { memorySize: 256, timeoutSeconds: 10 },
  },
  staging: {
    env: 'staging',
    region: 'eu-central-1',
    vendorBaseUrl: 'https://staging.vendor.example.com',
    cacheTtlSeconds: 900,
    logLevel: 'info',
    vendorApiKeySecretName: 'vendor-prefill/staging/vendor-api-key',
    auth: {
      issuer: 'https://staging-idp.example.com/',
      audience: 'vendor-prefill-staging',
      jwksUri: 'https://staging-idp.example.com/.well-known/jwks.json',
    },
    throttle: { rateLimit: 50, burstLimit: 100 },
    circuitBreaker: { timeoutMs: 3000, errorThresholdPercentage: 50, resetTimeoutMs: 15000 },
    concurrency: { getReserved: 10 },
    lambda: { memorySize: 512, timeoutSeconds: 15 },
  },
  prod: {
    env: 'prod',
    region: 'eu-central-1',
    vendorBaseUrl: 'https://api.vendor.example.com',
    cacheTtlSeconds: 3600,
    logLevel: 'info',
    vendorApiKeySecretName: 'vendor-prefill/prod/vendor-api-key',
    auth: {
      issuer: 'https://idp.example.com/',
      audience: 'vendor-prefill',
      jwksUri: 'https://idp.example.com/.well-known/jwks.json',
    },
    throttle: { rateLimit: 100, burstLimit: 200 },
    circuitBreaker: { timeoutMs: 3000, errorThresholdPercentage: 50, resetTimeoutMs: 15000 },
    concurrency: { getReserved: 50 },
    lambda: { memorySize: 512, timeoutSeconds: 15 },
  },
  // Demonstration environment: intentionally open and self-contained.
  // - disableAuth: no token check (public API)
  // - no vendorBaseUrl / secret: GET serves generated mock data (fake vendor)
  // - ephemeral: everything is DESTROY-on-teardown (env !== 'prod')
  // Safe precisely because it holds no secrets and no real data (ADR-0025).
  demo: {
    env: 'demo',
    region: 'eu-central-1',
    cacheTtlSeconds: 60,
    logLevel: 'debug',
    disableAuth: true,
    throttle: { rateLimit: 10, burstLimit: 20 }, // conservative: it is open to the world
    circuitBreaker: { timeoutMs: 3000, errorThresholdPercentage: 50, resetTimeoutMs: 15000 },
    concurrency: { getReserved: 2 },
    lambda: { memorySize: 256, timeoutSeconds: 10 },
  },
};

export function getConfig(env: string | undefined): AppConfig {
  const key = (env ?? 'dev') as Env;
  const cfg = configs[key];
  if (!cfg) {
    throw new Error(`Unknown env "${env}". Use one of: dev | staging | prod | demo.`);
  }
  return cfg;
}
