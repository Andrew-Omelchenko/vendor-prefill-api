import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import {
  createPrefillSchema,
  updatePrefillSchema,
  prefillRecordSchema,
} from '../src/domain/schemas';

const schema = (s: z.ZodType): Record<string, unknown> => {
  const json = z.toJSONSchema(s, { target: 'draft-7' }) as Record<string, unknown>;
  delete json.$schema;
  return json;
};
const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });
const str = { type: 'string' };

const doc = {
  openapi: '3.0.3',
  info: {
    title: 'Vendor Prefill API',
    version: '1.2.0',
    description:
      'Generated from the zod schemas. Do not edit by hand — run `npm run openapi:generate`.',
  },
  security: [{ bearerAuth: [] }],
  paths: {
    '/prefill': {
      post: {
        summary: 'Create a prefill record',
        operationId: 'createPrefill',
        requestBody: {
          required: true,
          content: { 'application/json': { schema: ref('CreatePrefillInput') } },
        },
        responses: {
          '201': {
            description: 'Record created (starts at version 1)',
            headers: { Location: { schema: str }, ETag: { schema: str } },
            content: { 'application/json': { schema: ref('PrefillRecord') } },
          },
          '400': { description: 'Invalid or missing fields' },
          '401': { description: 'Missing or invalid token' },
          '409': { description: 'A record with that id already exists' },
          '429': { description: 'Too many requests (throttled)' },
        },
      },
    },
    '/prefill/{id}': {
      parameters: [{ name: 'id', in: 'path', required: true, schema: str }],
      get: {
        summary: 'Get a prefill record by id',
        operationId: 'getPrefill',
        responses: {
          '200': {
            description: 'Prefill record',
            headers: { ETag: { schema: str } },
            content: { 'application/json': { schema: ref('PrefillRecord') } },
          },
          '400': { description: 'Missing or invalid id' },
          '401': { description: 'Missing or invalid token' },
          '429': { description: 'Too many requests (throttled)' },
          '502': { description: 'Vendor temporarily unavailable (circuit open)' },
        },
      },
      put: {
        summary: 'Replace a prefill record (optimistic concurrency)',
        operationId: 'updatePrefill',
        parameters: [
          {
            name: 'If-Match',
            in: 'header',
            required: true,
            description: 'The version last seen (an ETag), or `*` for any existing version.',
            schema: str,
          },
        ],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: ref('UpdatePrefillInput') } },
        },
        responses: {
          '200': {
            description: 'Updated (version bumped)',
            headers: { ETag: { schema: str } },
            content: { 'application/json': { schema: ref('PrefillRecord') } },
          },
          '400': { description: 'Invalid body or If-Match' },
          '401': { description: 'Missing or invalid token' },
          '404': { description: 'Record not found' },
          '412': { description: 'Version conflict (record changed since If-Match)' },
          '428': { description: 'If-Match header required' },
          '429': { description: 'Too many requests (throttled)' },
        },
      },
      delete: {
        summary: 'Delete a prefill record',
        operationId: 'deletePrefill',
        parameters: [
          {
            name: 'If-Match',
            in: 'header',
            required: false,
            description: 'When present, the delete is version-checked.',
            schema: str,
          },
        ],
        responses: {
          '204': { description: 'Deleted' },
          '401': { description: 'Missing or invalid token' },
          '404': { description: 'Record not found' },
          '412': { description: 'Version conflict' },
          '429': { description: 'Too many requests (throttled)' },
        },
      },
    },
  },
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'JWT validated at the edge by the API Gateway authorizer.',
      },
    },
    schemas: {
      CreatePrefillInput: schema(createPrefillSchema),
      UpdatePrefillInput: schema(updatePrefillSchema),
      PrefillRecord: schema(prefillRecordSchema),
    },
  },
};

const out = join(__dirname, '../openapi/prefill.json');
const serialized = JSON.stringify(doc, null, 2) + '\n';

if (process.argv.includes('--check')) {
  const current = readFileSync(out, 'utf8');
  if (current !== serialized) {
    console.error('openapi/prefill.json is out of date. Run: npm run openapi:generate');
    process.exit(1);
  }
  console.log('openapi/prefill.json is up to date.');
} else {
  writeFileSync(out, serialized);
  console.log('Wrote openapi/prefill.json');
}
