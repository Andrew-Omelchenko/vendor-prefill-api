import type { Logger } from '../domain/ports';
import type { PrefillService } from '../domain/prefill-service';
import { validateUpdateInput } from '../domain/validation';
import { headerValue, parseIfMatch } from '../lib/http';
import { ApiHandler, errorToResponse, json } from './handler-wrapper';

export function createPutPrefillHandler(service: PrefillService, logger: Logger): ApiHandler {
  return async (event) => {
    const id = event.pathParameters?.id;
    if (!id) return json(400, { error: 'id path parameter is required' });

    const ifMatch = headerValue(event.headers, 'if-match');
    if (!ifMatch) return json(428, { error: 'If-Match header is required' });
    const match = parseIfMatch(ifMatch);
    if ('invalid' in match) return json(400, { error: 'invalid If-Match value' });
    const expectedVersion = 'version' in match ? match.version : undefined;

    let parsed: unknown;
    try {
      parsed = event.body ? JSON.parse(event.body) : undefined;
    } catch {
      return json(400, { error: 'invalid JSON body' });
    }

    try {
      const input = validateUpdateInput(parsed);
      const record = await service.updatePrefill(id, input, expectedVersion);
      return json(200, record, { ETag: `"${record.version}"` });
    } catch (err) {
      return errorToResponse(err, logger);
    }
  };
}
