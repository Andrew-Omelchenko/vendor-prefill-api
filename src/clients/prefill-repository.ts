import { ConditionalCheckFailedException } from '@aws-sdk/client-dynamodb';
import {
  type DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  UpdateCommand,
  DeleteCommand,
} from '@aws-sdk/lib-dynamodb';
import { NotFoundError, PrefillAlreadyExistsError, VersionConflictError } from '../domain/errors';
import type { Clock, PrefillRepository, UpdateFields } from '../domain/ports';
import type { PrefillRecord } from '../domain/types';

export interface PrefillRepositoryDeps {
  doc: DynamoDBDocumentClient;
  tableName: string;
  cacheTtlSeconds: number;
  now: Clock;
}

export function createPrefillRepository(deps: PrefillRepositoryDeps): PrefillRepository {
  const { doc, tableName, cacheTtlSeconds, now } = deps;

  return {
    async getCached(id) {
      const { Item } = await doc.send(new GetCommand({ TableName: tableName, Key: { pk: id } }));
      return (Item as PrefillRecord | undefined) ?? null;
    },

    // Cache write (GET path): TTL-bound; returns exactly what was persisted.
    async putCached(id, payload) {
      const record: PrefillRecord = { ...payload, cachedAt: now().toISOString(), version: 1 };
      await doc.send(
        new PutCommand({
          TableName: tableName,
          Item: { pk: id, ...record, ttl: Math.floor(now().getTime() / 1000) + cacheTtlSeconds },
        }),
      );
      return record;
    },

    // Durable create (POST path): no TTL, create-only.
    async save(record) {
      try {
        await doc.send(
          new PutCommand({
            TableName: tableName,
            Item: { pk: record.id, ...record },
            ConditionExpression: 'attribute_not_exists(pk)',
          }),
        );
      } catch (err) {
        if (err instanceof ConditionalCheckFailedException) {
          throw new PrefillAlreadyExistsError(record.id);
        }
        throw err;
      }
    },

    // Optimistic-concurrency update (PUT path).
    async update(id, fields: UpdateFields, expectedVersion) {
      const versioned = expectedVersion !== undefined;
      try {
        const { Attributes } = await doc.send(
          new UpdateCommand({
            TableName: tableName,
            Key: { pk: id },
            UpdateExpression: 'SET #fn = :fn, #rs = :rs, #src = :src, #ca = :ca, #v = #v + :one',
            ConditionExpression: versioned
              ? 'attribute_exists(pk) AND #v = :expected'
              : 'attribute_exists(pk)',
            ExpressionAttributeNames: {
              '#fn': 'fullName',
              '#rs': 'riskScore',
              '#src': 'source',
              '#ca': 'cachedAt',
              '#v': 'version',
            },
            ExpressionAttributeValues: {
              ':fn': fields.fullName,
              ':rs': fields.riskScore,
              ':src': fields.source,
              ':ca': fields.cachedAt,
              ':one': 1,
              ...(versioned ? { ':expected': expectedVersion } : {}),
            },
            ReturnValues: 'ALL_NEW',
            ReturnValuesOnConditionCheckFailure: 'ALL_OLD',
          }),
        );
        return Attributes as PrefillRecord;
      } catch (err) {
        if (err instanceof ConditionalCheckFailedException) {
          throw err.Item ? new VersionConflictError(id) : new NotFoundError(id);
        }
        throw err;
      }
    },

    // Delete (DELETE path): conditional on existence; optionally on version.
    async remove(id, expectedVersion) {
      const versioned = expectedVersion !== undefined;
      try {
        await doc.send(
          new DeleteCommand({
            TableName: tableName,
            Key: { pk: id },
            ConditionExpression: versioned
              ? 'attribute_exists(pk) AND #v = :expected'
              : 'attribute_exists(pk)',
            ...(versioned
              ? {
                  ExpressionAttributeNames: { '#v': 'version' },
                  ExpressionAttributeValues: { ':expected': expectedVersion },
                }
              : {}),
            ReturnValuesOnConditionCheckFailure: 'ALL_OLD',
          }),
        );
      } catch (err) {
        if (err instanceof ConditionalCheckFailedException) {
          throw err.Item ? new VersionConflictError(id) : new NotFoundError(id);
        }
        throw err;
      }
    },
  };
}
