import { createAuthorizer } from '../handlers/authorizer';
import { verifyJwt } from '../lib/jwt';
import { logger } from '../lib/logger';
import { authConfig } from '../lib/runtime-config';

export const handler = createAuthorizer(
  { verify: (token) => verifyJwt(token, authConfig()) },
  logger,
);
