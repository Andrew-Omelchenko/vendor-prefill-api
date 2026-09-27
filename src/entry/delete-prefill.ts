import { createDeletePrefillHandler } from '../handlers/delete-prefill';
import { withRequestContext } from '../handlers/handler-wrapper';
import { logger } from '../lib/logger';
import { buildServiceWriteOnly } from './composition';

export const handler = withRequestContext(
  createDeletePrefillHandler(buildServiceWriteOnly(), logger),
  logger,
);
