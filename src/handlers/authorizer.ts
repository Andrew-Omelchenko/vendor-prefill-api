import type { APIGatewayAuthorizerResult, APIGatewayTokenAuthorizerHandler } from 'aws-lambda';
import type { Logger } from '../domain/ports';

export interface JwtVerifier {
  verify(token: string): Promise<{ sub?: unknown; scope?: unknown }>;
}

function allow(
  principalId: string,
  resource: string,
  context: Record<string, string>,
): APIGatewayAuthorizerResult {
  return {
    principalId,
    policyDocument: {
      Version: '2012-10-17',
      Statement: [{ Action: 'execute-api:Invoke', Effect: 'Allow', Resource: resource }],
    },
    context,
  };
}

export function createAuthorizer(
  verifier: JwtVerifier,
  logger: Logger,
): APIGatewayTokenAuthorizerHandler {
  // Async-only handler: it declares a single `event` parameter and returns a
  // Promise, so the Node 24 runtime treats it as async (no `callback`).
  return async (event) => {
    const header = event.authorizationToken ?? '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : header;
    if (!token) throw new Error('Unauthorized');

    try {
      const claims = await verifier.verify(token);
      const sub = typeof claims.sub === 'string' ? claims.sub : 'unknown';
      return allow(sub, event.methodArn, {
        sub,
        scope: typeof claims.scope === 'string' ? claims.scope : '',
      });
    } catch (err) {
      logger.warn('token verification failed', { err: (err as Error).message });
      throw new Error('Unauthorized', { cause: err });
    }
  };
}
