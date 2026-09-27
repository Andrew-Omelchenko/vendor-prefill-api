import type { PrefillRecord, VendorPayload } from './types';

export type Clock = () => Date;

export interface Logger {
  debug(msg: string, meta?: Record<string, unknown>): void;
  info(msg: string, meta?: Record<string, unknown>): void;
  warn(msg: string, meta?: Record<string, unknown>): void;
  error(msg: string, meta?: Record<string, unknown>): void;
  child(bindings: Record<string, unknown>): Logger;
}

export interface UpdateFields {
  fullName: string;
  riskScore: number;
  source: string;
  cachedAt: string;
}

export interface PrefillRepository {
  getCached(id: string): Promise<PrefillRecord | null>;
  putCached(id: string, payload: VendorPayload): Promise<PrefillRecord>;
  save(record: PrefillRecord): Promise<void>;
  update(id: string, fields: UpdateFields, expectedVersion?: number): Promise<PrefillRecord>;
  remove(id: string, expectedVersion?: number): Promise<void>;
}

export interface VendorClient {
  getVendorRecord(id: string): Promise<VendorPayload | null>;
}

export interface SecretsProvider {
  getSecret(name: string): Promise<string>;
}
