import { createFakeVendorClient } from '../../src/clients/fake-vendor-client';
import { vendorPayloadSchema } from '../../src/domain/schemas';

describe('fake vendor client', () => {
  it('returns a record echoing the id, marked as fake', async () => {
    const record = await createFakeVendorClient().getVendorRecord('user-1');
    expect(record?.id).toBe('user-1');
    expect(record?.source).toBe('fake-vendor');
  });

  it('is deterministic per id', async () => {
    const client = createFakeVendorClient();
    expect(await client.getVendorRecord('abc')).toEqual(await client.getVendorRecord('abc'));
  });

  it('produces in-contract data (passes the vendor payload schema)', async () => {
    const record = await createFakeVendorClient().getVendorRecord('user-1');
    expect(() => vendorPayloadSchema.parse(record)).not.toThrow();
  });
});
