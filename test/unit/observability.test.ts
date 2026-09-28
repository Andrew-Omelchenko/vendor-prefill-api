import type { APIGatewayProxyEvent, Context } from 'aws-lambda';
import { withRequestContext } from '../../src/handlers/handler-wrapper';
import { logger } from '../../src/lib/logger';
import { getCorrelationId } from '../../src/lib/request-context';

const ctx = { awsRequestId: 'aws-req-1' } as Context;
const event = (headers: Record<string, string> = {}, requestId = 'apigw-req-1') =>
  ({
    httpMethod: 'GET',
    resource: '/prefill/{id}',
    headers,
    requestContext: { requestId },
  }) as unknown as APIGatewayProxyEvent;

describe('withRequestContext', () => {
  let logs: string[] = [];
  let spy: jest.SpyInstance;
  beforeEach(() => {
    logs = [];
    spy = jest.spyOn(console, 'log').mockImplementation((line: string) => {
      logs.push(line);
    });
  });
  afterEach(() => spy.mockRestore());

  it('falls back to the API Gateway request id and propagates it to inner logs + response', async () => {
    const inner = jest.fn(async () => {
      logger.info('inside'); // logs from deeper code should carry the id via ALS
      return { statusCode: 200, body: '{}' };
    });
    const wrapped = withRequestContext(inner as never, logger);
    const res = (await wrapped(event(), ctx)) as {
      headers: Record<string, string>;
    };

    expect(res.headers['x-correlation-id']).toBe('apigw-req-1');
    const inside = logs.map((l) => JSON.parse(l)).find((o) => o.msg === 'inside');
    expect(inside.correlationId).toBe('apigw-req-1');
  });

  it('prefers an inbound x-correlation-id header for cross-service tracing', async () => {
    const inner = jest.fn(async () => ({ statusCode: 204, body: '' }));
    const wrapped = withRequestContext(inner as never, logger);
    const res = (await wrapped(event({ 'x-correlation-id': 'upstream-123' }), ctx)) as {
      headers: Record<string, string>;
    };

    expect(res.headers['x-correlation-id']).toBe('upstream-123');
  });

  it('exposes no correlation id outside a request scope', () => {
    expect(getCorrelationId()).toBeUndefined();
  });
});
