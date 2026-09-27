import { mockClient } from 'aws-sdk-client-mock';
import 'aws-sdk-client-mock-jest';
import { ConditionalCheckFailedException, DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  UpdateCommand,
  DeleteCommand,
} from '@aws-sdk/lib-dynamodb';
import { createPrefillRepository } from '../../src/clients/prefill-repository';
import {
  NotFoundError,
  PrefillAlreadyExistsError,
  VersionConflictError,
} from '../../src/domain/errors';

const ddbMock = mockClient(DynamoDBDocumentClient);
const doc = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const now = () => new Date('2020-01-01T00:00:00.000Z');
const repo = createPrefillRepository({ doc, tableName: 'test-table', cacheTtlSeconds: 3600, now });

const conflict = (present: boolean) =>
  new ConditionalCheckFailedException({
    $metadata: {},
    message: 'condition failed',
    ...(present ? { Item: { pk: { S: 'x' } } } : {}),
  });

describe('prefill-repository', () => {
  beforeEach(() => ddbMock.reset());

  it('getCached returns the stored item', async () => {
    ddbMock.on(GetCommand).resolves({
      Item: {
        pk: '1',
        id: '1',
        fullName: 'Ada',
        riskScore: 1,
        source: 'x',
        cachedAt: 'x',
        version: 1,
      },
    });
    expect((await repo.getCached('1'))?.id).toBe('1');
    expect(ddbMock).toHaveReceivedCommandWith(GetCommand, {
      TableName: 'test-table',
      Key: { pk: '1' },
    });
  });

  it('getCached returns null when nothing is found', async () => {
    ddbMock.on(GetCommand).resolves({});
    expect(await repo.getCached('missing')).toBeNull();
  });

  it('putCached writes a TTL-bound v1 item and returns it', async () => {
    ddbMock.on(PutCommand).resolves({});
    const record = await repo.putCached('2', {
      id: '2',
      fullName: 'Grace',
      riskScore: 2,
      source: 'vendor',
    });
    expect(record).toMatchObject({ id: '2', version: 1 });
    expect(ddbMock).toHaveReceivedCommandWith(PutCommand, {
      TableName: 'test-table',
      Item: expect.objectContaining({ pk: '2', ttl: expect.any(Number), version: 1 }),
    });
  });

  it('save uses a create-only condition and no TTL', async () => {
    ddbMock.on(PutCommand).resolves({});
    await repo.save({
      id: '3',
      fullName: 'Alan',
      riskScore: 3,
      source: 'manual',
      cachedAt: 'x',
      version: 1,
    });
    const input = ddbMock.commandCalls(PutCommand)[0].args[0].input;
    expect(input.ConditionExpression).toBe('attribute_not_exists(pk)');
    expect(input.Item).not.toHaveProperty('ttl');
  });

  it('save maps a conditional failure to PrefillAlreadyExistsError', async () => {
    ddbMock.on(PutCommand).rejects(conflict(false));
    await expect(
      repo.save({
        id: '3',
        fullName: 'Alan',
        riskScore: 3,
        source: 'manual',
        cachedAt: 'x',
        version: 1,
      }),
    ).rejects.toBeInstanceOf(PrefillAlreadyExistsError);
  });

  it('update bumps the version and conditions on the expected version', async () => {
    ddbMock.on(UpdateCommand).resolves({
      Attributes: {
        pk: '4',
        id: '4',
        fullName: 'New',
        riskScore: 9,
        source: 'manual',
        cachedAt: 'y',
        version: 3,
      },
    });
    const result = await repo.update(
      '4',
      { fullName: 'New', riskScore: 9, source: 'manual', cachedAt: 'y' },
      2,
    );
    expect(result.version).toBe(3);
    const input = ddbMock.commandCalls(UpdateCommand)[0].args[0].input;
    expect(input.ConditionExpression).toContain('#v = :expected');
    expect(input.ExpressionAttributeValues?.[':expected']).toBe(2);
  });

  it('update maps a conflict WITH an old item to VersionConflictError', async () => {
    ddbMock.on(UpdateCommand).rejects(conflict(true));
    await expect(
      repo.update('4', { fullName: 'N', riskScore: 1, source: 'manual', cachedAt: 'y' }, 2),
    ).rejects.toBeInstanceOf(VersionConflictError);
  });

  it('update maps a conflict WITHOUT an old item to NotFoundError', async () => {
    ddbMock.on(UpdateCommand).rejects(conflict(false));
    await expect(
      repo.update('4', { fullName: 'N', riskScore: 1, source: 'manual', cachedAt: 'y' }, 2),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('remove maps a missing item to NotFoundError', async () => {
    ddbMock.on(DeleteCommand).rejects(conflict(false));
    await expect(repo.remove('9')).rejects.toBeInstanceOf(NotFoundError);
  });

  it('remove succeeds when the item exists', async () => {
    ddbMock.on(DeleteCommand).resolves({});
    await expect(repo.remove('9')).resolves.toBeUndefined();
  });
});
