import type { APIGatewayTokenAuthorizerHandler, APIGatewayAuthorizerResult } from 'aws-lambda';
import type { Logger } from '../domain/ports';

export interface JwtVerifier {
  verify(token: string): Promise<{ sub?: unknown; scope?: unknown }>;
}

// Widen the policy resource from the single invoked method to the whole stage.
// API Gateway keys the authorizer result cache on the token alone. The method
// ARN includes the resolved path (which contains the resource id), so a policy
// scoped to one methodArn would be reused for other methods/ids with the same token
// and wrongly deny them (403) within the cache TTL. A stage-wide resource keeps the
// cached allow/deny decision correct; per-object authorization is enforced in the
// service layer, not here (see ADR-0026 and the BOLA design).
function stageResource(methodArn: string): string {
  const segments = methodArn.split(':');
  const [apiId, stage] = segments[5].split('/');
  return `${segments.slice(0, 5).join(':')}:${apiId}/${stage}/*`;
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
  return async (event) => {
    const header = event.authorizationToken ?? '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : header;
    if (!token) throw new Error('Unauthorized');

    try {
      const claims = await verifier.verify(token);
      const sub = typeof claims.sub === 'string' ? claims.sub : 'unknown';
      return allow(sub, stageResource(event.methodArn), {
        sub,
        scope: typeof claims.scope === 'string' ? claims.scope : '',
      });
    } catch (err) {
      logger.warn('token verification failed', { err: (err as Error).message });
      throw new Error('Unauthorized', { cause: err });
    }
  };
}
