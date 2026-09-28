// Component test: the real handlers + service + repository wired together and driven
// through HTTP (supertest), with DynamoDB mocked and the vendor stubbed. No network.
import request from 'supertest';
import express, { type Request, type Response } from 'express';
import { mockClient } from 'aws-sdk-client-mock';
import { ConditionalCheckFailedException, DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  UpdateCommand,
  DeleteCommand,
} from '@aws-sdk/lib-dynamodb';
import { createPrefillRepository } from '../../src/clients/prefill-repository';
import { createPrefillService } from '../../src/domain/prefill-service';
import { createGetPrefillHandler } from '../../src/handlers/get-prefill';
import { createPostPrefillHandler } from '../../src/handlers/post-prefill';
import { createPutPrefillHandler } from '../../src/handlers/put-prefill';
import { createDeletePrefillHandler } from '../../src/handlers/delete-prefill';
import type { Logger, VendorClient } from '../../src/domain/ports';

// Wire the real handlers over the real service, with DynamoDB mocked and a stub
// vendor — the full path minus the network, driven through supertest.
const ddbMock = mockClient(DynamoDBDocumentClient);
const doc = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const noopLogger: Logger = {
  debug() {},
  info() {},
  warn() {},
  error() {},
  child: () => noopLogger,
};
const now = () => new Date('2020-01-01T00:00:00.000Z');
const vendor: VendorClient = { getVendorRecord: async () => null }; // cache miss -> 502
const repository = createPrefillRepository({
  doc,
  tableName: 'test-table',
  cacheTtlSeconds: 3600,
  now,
});
const service = createPrefillService({ repository, vendor, logger: noopLogger, now });

const conflict = (present: boolean) =>
  new ConditionalCheckFailedException({
    $metadata: {},
    message: 'condition failed',
    ...(present ? { Item: { pk: { S: 'x' } } } : {}),
  });

const handlers = {
  get: createGetPrefillHandler(service, noopLogger),
  post: createPostPrefillHandler(service, noopLogger),
  put: createPutPrefillHandler(service, noopLogger),
  del: createDeletePrefillHandler(service, noopLogger),
};

const run =
  (h: typeof handlers.get) =>
  async (req: Request, res: Response): Promise<void> => {
    const id = (req.params as Record<string, string | undefined>).id;
    const hasBody = req.body && Object.keys(req.body).length > 0;
    const headers: Record<string, string | undefined> = {};
    for (const [k, v] of Object.entries(req.headers)) {
      headers[k] = Array.isArray(v) ? v.join(',') : v;
    }
    const event = {
      pathParameters: id ? { id } : null,
      headers,
      body: hasBody ? JSON.stringify(req.body) : null,
    } as unknown as Parameters<typeof handlers.get>[0];
    const result = (await h(event, {} as never)) as {
      statusCode: number;
      body: string;
    };
    res.status(result.statusCode).type('application/json').send(result.body);
  };

const app = express();
app.use(express.json());
app.get('/prefill', run(handlers.get));
app.get('/prefill/:id', run(handlers.get));
app.post('/prefill', run(handlers.post));
app.put('/prefill/:id', run(handlers.put));
app.delete('/prefill/:id', run(handlers.del));

describe('prefill API', () => {
  beforeEach(() => ddbMock.reset());

  it('GET returns 400 when the id is missing', async () => {
    expect((await request(app).get('/prefill')).status).toBe(400);
  });

  it('GET returns 502 on cache miss when the vendor is unavailable', async () => {
    ddbMock.on(GetCommand).resolves({});
    expect((await request(app).get('/prefill/x')).status).toBe(502);
  });

  it('POST returns 201 and a v1 record on success', async () => {
    ddbMock.on(PutCommand).resolves({});
    const res = await request(app)
      .post('/prefill')
      .send({ id: 'p1', fullName: 'Ada', riskScore: 7 });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ id: 'p1', source: 'manual', version: 1 });
  });

  it('POST returns 400 on an invalid body', async () => {
    expect((await request(app).post('/prefill').send({ fullName: 'no id' })).status).toBe(400);
  });

  it('PUT returns 428 without an If-Match header', async () => {
    expect(
      (await request(app).put('/prefill/p1').send({ fullName: 'A', riskScore: 1 })).status,
    ).toBe(428);
  });

  it('PUT returns 200 and the bumped version on success', async () => {
    ddbMock.on(UpdateCommand).resolves({
      Attributes: {
        pk: 'p1',
        id: 'p1',
        fullName: 'A',
        riskScore: 1,
        source: 'manual',
        cachedAt: 'y',
        version: 2,
      },
    });
    const res = await request(app)
      .put('/prefill/p1')
      .set('If-Match', '"1"')
      .send({ fullName: 'A', riskScore: 1 });
    expect(res.status).toBe(200);
    expect(res.body.version).toBe(2);
  });

  it('PUT returns 412 on a version conflict', async () => {
    ddbMock.on(UpdateCommand).rejects(conflict(true));
    const res = await request(app)
      .put('/prefill/p1')
      .set('If-Match', '"1"')
      .send({ fullName: 'A', riskScore: 1 });
    expect(res.status).toBe(412);
  });

  it('DELETE returns 204 on success', async () => {
    ddbMock.on(DeleteCommand).resolves({});
    expect((await request(app).delete('/prefill/p1')).status).toBe(204);
  });

  it('DELETE returns 404 when the record is missing', async () => {
    ddbMock.on(DeleteCommand).rejects(conflict(false));
    expect((await request(app).delete('/prefill/nope')).status).toBe(404);
  });
});
