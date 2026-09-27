// Deployed-stage smoke test. Opt-in: runs only when SMOKE_BASE_URL is set
// (e.g. after a deploy in CD), otherwise it is skipped. Run with:
//   SMOKE_BASE_URL=https://<api>/<stage> SMOKE_TOKEN=<jwt> npm run test:smoke
const baseUrl = process.env.SMOKE_BASE_URL;
const token = process.env.SMOKE_TOKEN ?? '';
const describeIf = baseUrl ? describe : describe.skip;

describeIf('deployed API smoke', () => {
  jest.setTimeout(30_000);
  const auth = { authorization: `Bearer ${token}` };

  it('rejects an unauthenticated request', async () => {
    const res = await fetch(`${baseUrl}/prefill/smoke-check`);
    expect([401, 403]).toContain(res.status);
  });

  it('responds to an authenticated GET (200 cached, or 502 vendor-degraded)', async () => {
    const res = await fetch(`${baseUrl}/prefill/smoke-check`, { headers: auth });
    expect([200, 404, 502]).toContain(res.status);
    // The correlation id should always be echoed back for traceability.
    expect(res.headers.get('x-correlation-id')).toBeTruthy();
  });

  it('rejects a create with an invalid body (contract enforced at the edge)', async () => {
    const res = await fetch(`${baseUrl}/prefill`, {
      method: 'POST',
      headers: { ...auth, 'content-type': 'application/json' },
      body: JSON.stringify({ nope: true }),
    });
    expect([400, 401, 403]).toContain(res.status);
  });
});
