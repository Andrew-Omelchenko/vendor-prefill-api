import type { Logger } from '../domain/ports';
import type { PrefillService } from '../domain/prefill-service';
import { validateCreateInput } from '../domain/validation';
import { ApiHandler, errorToResponse, json } from './handler-wrapper';

export function createPostPrefillHandler(service: PrefillService, logger: Logger): ApiHandler {
  return async (event) => {
    let parsed: unknown;
    try {
      parsed = event.body ? JSON.parse(event.body) : undefined;
    } catch {
      return json(400, { error: 'invalid JSON body' });
    }

    try {
      const input = validateCreateInput(parsed);
      const record = await service.createPrefill(input);
      return json(201, record, { location: `/prefill/${record.id}`, ETag: `"${record.version}"` });
    } catch (err) {
      return errorToResponse(err, logger);
    }
  };
}
