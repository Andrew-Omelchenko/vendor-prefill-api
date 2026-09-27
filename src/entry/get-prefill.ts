import { createGetPrefillHandler } from '../handlers/get-prefill';
import { withRequestContext } from '../handlers/handler-wrapper';
import { logger } from '../lib/logger';
import { buildServiceWithVendor } from './composition';

export const handler = withRequestContext(
  createGetPrefillHandler(buildServiceWithVendor(), logger),
  logger,
);
