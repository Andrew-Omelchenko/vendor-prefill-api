import type { APIGatewayAuthorizerResult, APIGatewayTokenAuthorizerEvent } from 'aws-lambda';
import { createAuthorizer } from '../../src/handlers/authorizer';
import type { Logger } from '../../src/domain/ports';

const noopLogger: Logger = {
  debug() {},
  info() {},
  warn() {},
  error() {},
  child: () => noopLogger,
};

const event = (token?: string): APIGatewayTokenAuthorizerEvent =>
  ({
    type: 'TOKEN',
    authorizationToken: token ?? '',
    methodArn: 'arn:aws:execute-api:eu-central-1:123:api/dev/GET/prefill/1',
  }) as APIGatewayTokenAuthorizerEvent;

const run = (verify: jest.Mock, token?: string) =>
  createAuthorizer({ verify }, noopLogger)(
    event(token),
    {} as never,
    () => undefined,
  ) as Promise<APIGatewayAuthorizerResult>;

describe('authorizer', () => {
  it('allows a valid token and passes claims through as context', async () => {
    const result = await run(
      jest.fn().mockResolvedValue({ sub: 'user-1', scope: 'read write' }),
      'Bearer good',
    );
    expect(result.policyDocument.Statement[0].Effect).toBe('Allow');
    expect(result.principalId).toBe('user-1');
    expect(result.context?.scope).toBe('read write');
  });

  it('rejects a missing token with Unauthorized', async () => {
    await expect(run(jest.fn(), undefined)).rejects.toThrow('Unauthorized');
  });

  it('rejects an invalid token with Unauthorized', async () => {
    await expect(run(jest.fn().mockRejectedValue(new Error('bad')), 'Bearer bad')).rejects.toThrow(
      'Unauthorized',
    );
  });
});

describe('authorizer claim handling', () => {
  it('accepts a raw token without the Bearer prefix and defaults missing claims', async () => {
    const verify = jest.fn().mockResolvedValue({ sub: 12345, scope: undefined });
    const result = (await createAuthorizer({ verify }, noopLogger)(
      event('raw-token-no-prefix'),
      {} as never,
      () => undefined,
    )) as APIGatewayAuthorizerResult;
    expect(verify).toHaveBeenCalledWith('raw-token-no-prefix');
    expect(result.principalId).toBe('unknown'); // non-string sub -> 'unknown'
    expect(result.context?.scope).toBe(''); // missing scope -> ''
  });
});
