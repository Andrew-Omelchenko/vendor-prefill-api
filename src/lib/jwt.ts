import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';

// One remote JWKS set per URI, reused across warm invocations (it caches keys).
const jwksCache = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

function jwks(uri: string): ReturnType<typeof createRemoteJWKSet> {
  let set = jwksCache.get(uri);
  if (!set) {
    set = createRemoteJWKSet(new URL(uri));
    jwksCache.set(uri, set);
  }
  return set;
}

export interface VerifyOptions {
  issuer: string;
  audience: string;
  jwksUri: string;
}

// Verifies signature (against the IdP's JWKS) plus issuer, audience and exp.
// Throws if the token is missing, malformed, expired, or otherwise invalid.
export async function verifyJwt(token: string, opts: VerifyOptions): Promise<JWTPayload> {
  const { payload } = await jwtVerify(token, jwks(opts.jwksUri), {
    issuer: opts.issuer,
    audience: opts.audience,
  });
  return payload;
}
