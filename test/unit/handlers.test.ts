import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { createGetPrefillHandler } from '../../src/handlers/get-prefill';
import { createPostPrefillHandler } from '../../src/handlers/post-prefill';
import { createPutPrefillHandler } from '../../src/handlers/put-prefill';
import { createDeletePrefillHandler } from '../../src/handlers/delete-prefill';
import { NotFoundError } from '../../src/domain/errors';
import type { Logger } from '../../src/domain/ports';
import type { PrefillService } from '../../src/domain/prefill-service';

const noopLogger: Logger = {
  debug() {},
  info() {},
  warn() {},
  error() {},
  child: () => noopLogger,
};

function fakeService(): jest.Mocked<PrefillService> {
  return {
    getPrefill: jest.fn(),
    createPrefill: jest.fn(),
    updatePrefill: jest.fn(),
    deletePrefill: jest.fn(),
  };
}

const invoke = async (
  handler: ReturnType<typeof createGetPrefillHandler>,
  event: Partial<APIGatewayProxyEvent>,
): Promise<APIGatewayProxyResult> =>
  (await handler(event as APIGatewayProxyEvent, {} as never)) as APIGatewayProxyResult;

describe('GET handler edge paths', () => {
  it('returns 400 when the id is missing', async () => {
    const res = await invoke(createGetPrefillHandler(fakeService(), noopLogger), {
      pathParameters: null,
    });
    expect(res.statusCode).toBe(400);
  });
  it('maps an unexpected error to 500', async () => {
    const service = fakeService();
    service.getPrefill.mockRejectedValue(new Error('dynamo exploded'));
    const res = await invoke(createGetPrefillHandler(service, noopLogger), {
      pathParameters: { id: '1' },
    });
    expect(res.statusCode).toBe(500);
    expect(JSON.parse(res.body)).toEqual({ error: 'internal error' });
  });
});

describe('POST handler edge paths', () => {
  it('returns 400 on malformed JSON', async () => {
    const res = await invoke(createPostPrefillHandler(fakeService(), noopLogger), {
      body: '{not json',
    });
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toMatch(/invalid JSON/i);
  });
});

describe('PUT handler edge paths', () => {
  it('returns 428 without an If-Match header', async () => {
    const res = await invoke(createPutPrefillHandler(fakeService(), noopLogger), {
      pathParameters: { id: '1' },
      headers: {},
      body: '{}',
    });
    expect(res.statusCode).toBe(428);
  });
  it('returns 400 on an invalid If-Match value', async () => {
    const res = await invoke(createPutPrefillHandler(fakeService(), noopLogger), {
      pathParameters: { id: '1' },
      headers: { 'If-Match': 'garbage' },
      body: '{}',
    });
    expect(res.statusCode).toBe(400);
  });
  it('returns 400 on malformed JSON', async () => {
    const res = await invoke(createPutPrefillHandler(fakeService(), noopLogger), {
      pathParameters: { id: '1' },
      headers: { 'If-Match': '"1"' },
      body: '{bad',
    });
    expect(res.statusCode).toBe(400);
  });
});

describe('DELETE handler edge paths', () => {
  it('returns 400 on an invalid If-Match value', async () => {
    const res = await invoke(createDeletePrefillHandler(fakeService(), noopLogger), {
      pathParameters: { id: '1' },
      headers: { 'If-Match': 'nope' },
    });
    expect(res.statusCode).toBe(400);
  });
  it('returns 204 on success', async () => {
    const service = fakeService();
    service.deletePrefill.mockResolvedValue();
    const res = await invoke(createDeletePrefillHandler(service, noopLogger), {
      pathParameters: { id: '1' },
      headers: {},
    });
    expect(res.statusCode).toBe(204);
  });
  it('maps NotFoundError to 404', async () => {
    const service = fakeService();
    service.deletePrefill.mockRejectedValue(new NotFoundError('1'));
    const res = await invoke(createDeletePrefillHandler(service, noopLogger), {
      pathParameters: { id: '1' },
      headers: {},
    });
    expect(res.statusCode).toBe(404);
  });
});
