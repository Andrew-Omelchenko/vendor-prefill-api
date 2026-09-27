import type { AddressInfo } from 'node:net';
import dynalite from 'dynalite';
import { DynamoDBClient, CreateTableCommand } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { createPrefillRepository } from '../../src/clients/prefill-repository';
import { NotFoundError, PrefillAlreadyExistsError } from '../../src/domain/errors';
import type { PrefillRepository } from '../../src/domain/ports';

// Integration test: the repository against a real DynamoDB API surface (dynalite,
// an in-process clone — no Docker/Java), exercising conditional writes on the wire.
// Note: dynalite does not return the old item on a failed condition, so the
// VersionConflict-vs-NotFound *distinction* is covered by the unit tests (which mock
// that field). Here we verify the create/read/update/delete behaviour end to end.

const TABLE = 'prefill-cache';
const now = () => new Date('2020-01-01T00:00:00.000Z');

let server: ReturnType<typeof dynalite>;
let client: DynamoDBClient;
let repo: PrefillRepository;

jest.setTimeout(30_000);

beforeAll(async () => {
  server = dynalite({ createTableMs: 0 });
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const { port } = server.address() as AddressInfo;
  client = new DynamoDBClient({
    endpoint: `http://127.0.0.1:${port}`,
    region: 'local',
    credentials: { accessKeyId: 'local', secretAccessKey: 'local' },
  });
  await client.send(
    new CreateTableCommand({
      TableName: TABLE,
      AttributeDefinitions: [{ AttributeName: 'pk', AttributeType: 'S' }],
      KeySchema: [{ AttributeName: 'pk', KeyType: 'HASH' }],
      BillingMode: 'PAY_PER_REQUEST',
    }),
  );
  repo = createPrefillRepository({
    doc: DynamoDBDocumentClient.from(client),
    tableName: TABLE,
    cacheTtlSeconds: 3600,
    now,
  });
});

afterAll(async () => {
  client?.destroy();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

it('save then getCached round-trips a record', async () => {
  await repo.save({
    id: 'r1',
    fullName: 'Ada',
    riskScore: 5,
    source: 'manual',
    cachedAt: 'x',
    version: 1,
  });
  const got = await repo.getCached('r1');
  expect(got).toMatchObject({ id: 'r1', fullName: 'Ada', version: 1 });
});

it('getCached returns null for an unknown id', async () => {
  expect(await repo.getCached('does-not-exist')).toBeNull();
});

it('putCached writes a v1 record and reads back', async () => {
  const written = await repo.putCached('r2', {
    id: 'r2',
    fullName: 'Grace',
    riskScore: 9,
    source: 'vendor',
  });
  expect(written.version).toBe(1);
  expect((await repo.getCached('r2'))?.source).toBe('vendor');
});

it('save is create-only: a second save raises PrefillAlreadyExistsError', async () => {
  await repo.save({
    id: 'r3',
    fullName: 'Linus',
    riskScore: 1,
    source: 'manual',
    cachedAt: 'x',
    version: 1,
  });
  await expect(
    repo.save({
      id: 'r3',
      fullName: 'Linus',
      riskScore: 1,
      source: 'manual',
      cachedAt: 'x',
      version: 1,
    }),
  ).rejects.toBeInstanceOf(PrefillAlreadyExistsError);
});

it('update bumps the version and persists', async () => {
  await repo.save({
    id: 'r4',
    fullName: 'Old',
    riskScore: 1,
    source: 'manual',
    cachedAt: 'x',
    version: 1,
  });
  const updated = await repo.update(
    'r4',
    { fullName: 'New', riskScore: 2, source: 'manual', cachedAt: 'y' },
    1,
  );
  expect(updated.version).toBe(2);
  expect((await repo.getCached('r4'))?.fullName).toBe('New');
});

it('update of an unknown id raises NotFoundError', async () => {
  await expect(
    repo.update('ghost', { fullName: 'x', riskScore: 1, source: 'manual', cachedAt: 'y' }),
  ).rejects.toBeInstanceOf(NotFoundError);
});

it('a stale-version update is rejected', async () => {
  await repo.save({
    id: 'r5',
    fullName: 'A',
    riskScore: 1,
    source: 'manual',
    cachedAt: 'x',
    version: 1,
  });
  await repo.update('r5', { fullName: 'B', riskScore: 1, source: 'manual', cachedAt: 'y' }, 1); // -> v2
  await expect(
    repo.update('r5', { fullName: 'C', riskScore: 1, source: 'manual', cachedAt: 'z' }, 1),
  ).rejects.toBeInstanceOf(Error);
});

it('remove deletes; a second remove raises NotFoundError', async () => {
  await repo.save({
    id: 'r6',
    fullName: 'Temp',
    riskScore: 1,
    source: 'manual',
    cachedAt: 'x',
    version: 1,
  });
  await expect(repo.remove('r6')).resolves.toBeUndefined();
  expect(await repo.getCached('r6')).toBeNull();
  await expect(repo.remove('r6')).rejects.toBeInstanceOf(NotFoundError);
});
