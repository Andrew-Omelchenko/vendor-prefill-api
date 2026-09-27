import type { APIGatewayProxyHandler } from 'aws-lambda';
import type { Logger } from '../domain/ports';
import type { PrefillService } from '../domain/prefill-service';
import { errorToResponse, json } from './handler-wrapper';

export function createGetPrefillHandler(
  service: PrefillService,
  logger: Logger,
): APIGatewayProxyHandler {
  return async (event) => {
    const id = event.pathParameters?.id;
    if (!id) return json(400, { error: 'id path parameter is required' });

    try {
      const result = await service.getPrefill(id);
      if (!result) return json(502, { error: 'vendor temporarily unavailable' });
      return json(200, result, { ETag: `"${result.version}"` });
    } catch (err) {
      return errorToResponse(err, logger);
    }
  };
}
