import { AsyncLocalStorage } from 'node:async_hooks';

export interface RequestContext {
  correlationId: string;
}

const storage = new AsyncLocalStorage<RequestContext>();

// Runs fn with the given context active for the whole async call tree, so any
// code (service, adapters) can read the correlation id without it being threaded
// through every function signature.
export function runWithRequestContext<T>(context: RequestContext, fn: () => T): T {
  return storage.run(context, fn);
}

export function getCorrelationId(): string | undefined {
  return storage.getStore()?.correlationId;
}
