import type { Logger, VendorClient } from '../domain/ports';
import type { VendorPayload } from '../domain/types';

// A stand-in for the external vendor, used when VENDOR_BASE_URL is not configured
// (local runs, self-contained dev). It generates in-contract records with no network
// call and no dependency. Records are deterministic per id (a small FNV-1a hash), so
// the same id always yields the same data — handy for local runs and cache demos.
const NAMES = [
  'Ada Lovelace',
  'Grace Hopper',
  'Alan Turing',
  'Katherine Johnson',
  'Margaret Hamilton',
  'Barbara Liskov',
  'Dennis Ritchie',
  'Ken Thompson',
  'Edsger Dijkstra',
  'Radia Perlman',
];

function hash(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export interface FakeVendorClientDeps {
  logger?: Logger;
}

export function createFakeVendorClient(deps: FakeVendorClientDeps = {}): VendorClient {
  const { logger } = deps;
  return {
    async getVendorRecord(id) {
      const h = hash(id);
      const record: VendorPayload = {
        id,
        fullName: NAMES[h % NAMES.length],
        riskScore: h % 101, // 0..100, within the domain bound
        source: 'fake-vendor',
      };
      logger?.debug('fake vendor record generated', { id });
      return record;
    },
  };
}
