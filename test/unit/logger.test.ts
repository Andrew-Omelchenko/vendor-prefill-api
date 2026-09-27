import { createLogger, logger } from '../../src/lib/logger';

describe('logger', () => {
  let logs: string[] = [];
  let spy: jest.SpyInstance;

  beforeAll(() => {
    process.env.LOG_LEVEL = 'warn'; // read lazily on first emit
    process.env.SERVICE_NAME = 'test-svc';
  });
  beforeEach(() => {
    logs = [];
    spy = jest.spyOn(console, 'log').mockImplementation((line: string) => {
      logs.push(line);
    });
  });
  afterEach(() => spy.mockRestore());

  it('suppresses levels below the configured threshold', () => {
    logger.debug('d');
    logger.info('i');
    expect(logs).toHaveLength(0);
  });

  it('emits at or above the threshold with structured fields', () => {
    logger.warn('careful', { code: 1 });
    expect(logs).toHaveLength(1);
    const line = JSON.parse(logs[0]);
    expect(line).toMatchObject({ level: 'warn', msg: 'careful', code: 1 });
    expect(line.ts).toBeDefined();
    expect(line.correlationId).toBeUndefined(); // no request scope active
  });

  it('binds static fields via child()', () => {
    createLogger({ component: 'repository' }).error('boom');
    const line = JSON.parse(logs[0]);
    expect(line).toMatchObject({ level: 'error', msg: 'boom', component: 'repository' });
  });
});

describe('logger PII redaction', () => {
  let logs: string[] = [];
  let spy: jest.SpyInstance;
  beforeEach(() => {
    logs = [];
    spy = jest.spyOn(console, 'log').mockImplementation((line: string) => {
      logs.push(line);
    });
  });
  afterEach(() => spy.mockRestore());

  it('never emits PII fields passed in metadata', () => {
    logger.error('leak attempt', { id: '1', fullName: 'Ada', riskScore: 90 });
    const line = JSON.parse(logs[0]);
    expect(line.id).toBe('1');
    expect(line.fullName).toBe('[redacted]');
    expect(line.riskScore).toBe('[redacted]');
  });
});
