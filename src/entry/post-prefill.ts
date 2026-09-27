import { createPostPrefillHandler } from '../handlers/post-prefill';
import { withRequestContext } from '../handlers/handler-wrapper';
import { logger } from '../lib/logger';
import { buildServiceWriteOnly } from './composition';

export const handler = withRequestContext(
  createPostPrefillHandler(buildServiceWriteOnly(), logger),
  logger,
);
