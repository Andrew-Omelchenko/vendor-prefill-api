import { emitCircuitOpen } from '../../src/lib/metrics';

describe('metrics (EMF)', () => {
  it('emits a CloudWatch-parseable EMF metric for a circuit open', () => {
    const spy = jest.spyOn(console, 'log').mockImplementation(() => {});
    emitCircuitOpen();
    const logged = JSON.parse(spy.mock.calls[0][0] as string);
    expect(logged._aws.CloudWatchMetrics[0].Metrics[0].Name).toBe('VendorCircuitOpen');
    expect(logged._aws.CloudWatchMetrics[0].Namespace).toBe('VendorPrefill');
    expect(logged.VendorCircuitOpen).toBe(1);
    spy.mockRestore();
  });
});
