import { createPutPrefillHandler } from '../handlers/put-prefill';
import { withRequestContext } from '../handlers/handler-wrapper';
import { logger } from '../lib/logger';
import { buildServiceWriteOnly } from './composition';

export const handler = withRequestContext(
  createPutPrefillHandler(buildServiceWriteOnly(), logger),
  logger,
);
