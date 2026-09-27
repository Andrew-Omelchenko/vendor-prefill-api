import type { Logger } from '../domain/ports';
import { getCorrelationId } from './request-context';
import { redactPii } from './redact';
import { observabilityConfig } from './runtime-config';

type Level = 'debug' | 'info' | 'warn' | 'error';
const order: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };

// bindings are static fields (e.g. a component name) attached via child();
// correlationId is dynamic per request and read from the async context on emit.
export function createLogger(bindings: Record<string, unknown> = {}): Logger {
  const emit = (level: Level, msg: string, meta: Record<string, unknown> = {}): void => {
    if (order[level] < order[observabilityConfig().logLevel]) return;
    const correlationId = getCorrelationId();
    console.log(
      JSON.stringify({
        level,
        msg,
        ...(correlationId ? { correlationId } : {}),
        ...bindings,
        ...redactPii(meta), // defense in depth: never emit PII/secrets
        ts: new Date().toISOString(),
      }),
    );
  };

  return {
    debug: (m, meta) => emit('debug', m, meta),
    info: (m, meta) => emit('info', m, meta),
    warn: (m, meta) => emit('warn', m, meta),
    error: (m, meta) => emit('error', m, meta),
    child: (extra) => createLogger({ ...bindings, ...extra }),
  };
}

export const logger = createLogger();
