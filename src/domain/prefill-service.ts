import type { Clock, Logger, PrefillRepository, VendorClient } from './ports';
import type { CreatePrefillInput, UpdatePrefillInput } from './schemas';
import type { PrefillRecord } from './types';

export interface PrefillService {
  getPrefill(id: string): Promise<PrefillRecord | null>;
  createPrefill(input: CreatePrefillInput): Promise<PrefillRecord>;
  updatePrefill(
    id: string,
    input: UpdatePrefillInput,
    expectedVersion?: number,
  ): Promise<PrefillRecord>;
  deletePrefill(id: string, expectedVersion?: number): Promise<void>;
}

export interface PrefillServiceDeps {
  repository: PrefillRepository;
  vendor: VendorClient;
  logger: Logger;
  now: Clock;
}

export function createPrefillService(deps: PrefillServiceDeps): PrefillService {
  const { repository, vendor, logger, now } = deps;

  return {
    async getPrefill(id) {
      const cached = await repository.getCached(id);
      if (cached) {
        logger.debug('cache hit', { id });
        return cached;
      }
      logger.debug('cache miss', { id });

      const record = await vendor.getVendorRecord(id);
      if (!record) {
        logger.warn('vendor unavailable', { id });
        return null;
      }
      return repository.putCached(id, record);
    },

    async createPrefill(input) {
      const record: PrefillRecord = {
        id: input.id,
        fullName: input.fullName,
        riskScore: input.riskScore,
        source: input.source ?? 'manual',
        cachedAt: now().toISOString(),
        version: 1,
      };
      await repository.save(record);
      logger.info('prefill created', { id: record.id });
      return record;
    },

    async updatePrefill(id, input, expectedVersion) {
      const record = await repository.update(
        id,
        {
          fullName: input.fullName,
          riskScore: input.riskScore,
          source: input.source ?? 'manual',
          cachedAt: now().toISOString(),
        },
        expectedVersion,
      );
      logger.info('prefill updated', { id, version: record.version });
      return record;
    },

    async deletePrefill(id, expectedVersion) {
      await repository.remove(id, expectedVersion);
      logger.info('prefill deleted', { id });
    },
  };
}
