import type { APIGatewayProxyHandler } from 'aws-lambda';
import type { Logger } from '../domain/ports';
import type { PrefillService } from '../domain/prefill-service';
import { headerValue, parseIfMatch } from '../lib/http';
import { errorToResponse, json } from './handler-wrapper';

export function createDeletePrefillHandler(
  service: PrefillService,
  logger: Logger,
): APIGatewayProxyHandler {
  return async (event) => {
    const id = event.pathParameters?.id;
    if (!id) return json(400, { error: 'id path parameter is required' });

    let expectedVersion: number | undefined;
    const ifMatch = headerValue(event.headers, 'if-match');
    if (ifMatch) {
      const match = parseIfMatch(ifMatch);
      if ('invalid' in match) return json(400, { error: 'invalid If-Match value' });
      expectedVersion = 'version' in match ? match.version : undefined;
    }

    try {
      await service.deletePrefill(id, expectedVersion);
      return { statusCode: 204, body: '' };
    } catch (err) {
      return errorToResponse(err, logger);
    }
  };
}
