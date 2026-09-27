import { createPrefillService } from '../../src/domain/prefill-service';
import { PrefillAlreadyExistsError } from '../../src/domain/errors';
import type { Logger, PrefillRepository, VendorClient } from '../../src/domain/ports';

const noopLogger: Logger = {
  debug() {},
  info() {},
  warn() {},
  error() {},
  child: () => noopLogger,
};
const now = () => new Date('2020-01-01T00:00:00.000Z');

function setup() {
  const repository: jest.Mocked<PrefillRepository> = {
    getCached: jest.fn(),
    putCached: jest.fn(),
    save: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
  };
  const vendor: jest.Mocked<VendorClient> = { getVendorRecord: jest.fn() };
  const service = createPrefillService({ repository, vendor, logger: noopLogger, now });
  return { repository, vendor, service };
}

describe('getPrefill', () => {
  it('returns the cached record and never calls the vendor', async () => {
    const { repository, vendor, service } = setup();
    repository.getCached.mockResolvedValue({
      id: '1',
      fullName: 'Ada',
      riskScore: 10,
      source: 'cache',
      cachedAt: 'x',
      version: 4,
    });
    const result = await service.getPrefill('1');
    expect(result?.version).toBe(4);
    expect(vendor.getVendorRecord).not.toHaveBeenCalled();
  });

  it('falls back to the vendor on a cache miss and persists', async () => {
    const { repository, vendor, service } = setup();
    repository.getCached.mockResolvedValue(null);
    vendor.getVendorRecord.mockResolvedValue({
      id: '2',
      fullName: 'Grace',
      riskScore: 20,
      source: 'vendor',
    });
    repository.putCached.mockResolvedValue({
      id: '2',
      fullName: 'Grace',
      riskScore: 20,
      source: 'vendor',
      cachedAt: 'x',
      version: 1,
    });
    const result = await service.getPrefill('2');
    expect(result).toMatchObject({ source: 'vendor', version: 1 });
    expect(repository.putCached).toHaveBeenCalledWith('2', expect.objectContaining({ id: '2' }));
  });

  it('returns null when the vendor is unavailable', async () => {
    const { repository, vendor, service } = setup();
    repository.getCached.mockResolvedValue(null);
    vendor.getVendorRecord.mockResolvedValue(null);
    expect(await service.getPrefill('3')).toBeNull();
  });
});

describe('createPrefill', () => {
  it('builds a v1 record, defaults source to manual, and saves', async () => {
    const { repository, service } = setup();
    repository.save.mockResolvedValue();
    const result = await service.createPrefill({ id: '9', fullName: 'Linus', riskScore: 4 });
    expect(result).toMatchObject({ id: '9', source: 'manual', version: 1 });
    expect(result.cachedAt).toBe('2020-01-01T00:00:00.000Z'); // injected clock
    expect(repository.save).toHaveBeenCalledWith(expect.objectContaining({ id: '9' }));
  });

  it('propagates a conflict from the repository', async () => {
    const { repository, service } = setup();
    repository.save.mockRejectedValue(new PrefillAlreadyExistsError('9'));
    await expect(
      service.createPrefill({ id: '9', fullName: 'Linus', riskScore: 4 }),
    ).rejects.toBeInstanceOf(PrefillAlreadyExistsError);
  });
});

describe('updatePrefill', () => {
  it('applies default source and returns the updated record', async () => {
    const { repository, service } = setup();
    repository.update.mockResolvedValue({
      id: '1',
      fullName: 'X',
      riskScore: 2,
      source: 'manual',
      cachedAt: 'y',
      version: 3,
    });
    const result = await service.updatePrefill('1', { fullName: 'X', riskScore: 2 }, 2);
    expect(result.version).toBe(3);
    expect(repository.update).toHaveBeenCalledWith(
      '1',
      expect.objectContaining({ source: 'manual' }),
      2,
    );
  });
});

describe('deletePrefill', () => {
  it('delegates to the repository with the expected version', async () => {
    const { repository, service } = setup();
    repository.remove.mockResolvedValue();
    await service.deletePrefill('1', 5);
    expect(repository.remove).toHaveBeenCalledWith('1', 5);
  });
});
