import type { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';
import {
  NotFoundError,
  PrefillAlreadyExistsError,
  ValidationError,
  VersionConflictError,
} from '../domain/errors';
import type { Logger } from '../domain/ports';
import { headerValue } from '../lib/http';
import { runWithRequestContext } from '../lib/request-context';

// Async-only handler (Node 24 Lambda no longer supports callback handlers).
export type ApiHandler = (
  event: APIGatewayProxyEvent,
  context: Context,
) => Promise<APIGatewayProxyResult>;

export function json(
  statusCode: number,
  body: unknown,
  headers: Record<string, string> = {},
): APIGatewayProxyResult {
  return {
    statusCode,
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  };
}

// One place maps known domain errors to HTTP responses, so every handler stays
// consistent and unknown errors are logged with a stack, not swallowed.
export function errorToResponse(err: unknown, logger: Logger): APIGatewayProxyResult {
  if (err instanceof ValidationError) return json(400, { error: err.message });
  if (err instanceof PrefillAlreadyExistsError) return json(409, { error: err.message });
  if (err instanceof NotFoundError) return json(404, { error: err.message });
  if (err instanceof VersionConflictError) return json(412, { error: err.message });
  const e = err as Error;
  logger.error('unhandled error', { name: e.name, err: e.message, stack: e.stack });
  return json(500, { error: 'internal error' });
}

// Establishes a correlation id for the request (an inbound x-correlation-id
// header for cross-service tracing, else the API Gateway request id), makes it
// available to all downstream logs via AsyncLocalStorage, echoes it back on the
// response, and emits one structured line per request with the status and latency.
export function withRequestContext(handler: ApiHandler, log: Logger): ApiHandler {
  return async (event, context) => {
    const incoming = headerValue(event.headers, 'x-correlation-id');
    const correlationId = incoming ?? event.requestContext?.requestId ?? context.awsRequestId;
    const start = Date.now();

    return runWithRequestContext({ correlationId }, async () => {
      const result = await handler(event, context);
      log.info('request handled', {
        method: event.httpMethod,
        path: event.resource,
        status: result.statusCode,
        ms: Date.now() - start,
      });
      return { ...result, headers: { 'x-correlation-id': correlationId, ...result.headers } };
    });
  };
}
