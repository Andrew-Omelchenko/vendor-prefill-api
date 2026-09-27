import { validateCreateInput } from '../../src/domain/validation';
import { ValidationError } from '../../src/domain/errors';

describe('validateCreateInput', () => {
  it('accepts a valid body', () => {
    const input = validateCreateInput({ id: '1', fullName: 'Ada', riskScore: 5 });
    expect(input).toEqual({ id: '1', fullName: 'Ada', riskScore: 5 });
  });

  it('leaves optional source undefined when omitted', () => {
    const input = validateCreateInput({ id: '1', fullName: 'Ada', riskScore: 5 });
    expect(input.source).toBeUndefined();
  });

  it('rejects unknown fields', () => {
    expect(() =>
      validateCreateInput({ id: '1', fullName: 'Ada', riskScore: 5, extra: 'x' }),
    ).toThrow(ValidationError);
  });

  it('rejects a missing required field', () => {
    expect(() => validateCreateInput({ fullName: 'Ada', riskScore: 5 })).toThrow(ValidationError);
  });

  it('rejects a wrong type', () => {
    expect(() => validateCreateInput({ id: '1', fullName: 'Ada', riskScore: 'high' })).toThrow(
      ValidationError,
    );
  });

  it('rejects an empty string id', () => {
    expect(() => validateCreateInput({ id: '', fullName: 'Ada', riskScore: 5 })).toThrow(
      ValidationError,
    );
  });
});

import { validateUpdateInput } from '../../src/domain/validation';

describe('validateUpdateInput', () => {
  it('accepts a valid update body (no id)', () => {
    expect(validateUpdateInput({ fullName: 'Ada', riskScore: 5 })).toEqual({
      fullName: 'Ada',
      riskScore: 5,
    });
  });

  it('rejects an id field (id comes from the path)', () => {
    expect(() => validateUpdateInput({ id: '1', fullName: 'Ada', riskScore: 5 })).toThrow(
      ValidationError,
    );
  });

  it('rejects a missing required field', () => {
    expect(() => validateUpdateInput({ riskScore: 5 })).toThrow(ValidationError);
  });
});

describe('field constraints', () => {
  it('rejects a riskScore above the allowed range', () => {
    expect(() => validateCreateInput({ id: '1', fullName: 'Ada', riskScore: 150 })).toThrow(
      ValidationError,
    );
  });

  it('rejects a negative riskScore', () => {
    expect(() => validateCreateInput({ id: '1', fullName: 'Ada', riskScore: -1 })).toThrow(
      ValidationError,
    );
  });

  it('rejects a non-integer riskScore', () => {
    expect(() => validateCreateInput({ id: '1', fullName: 'Ada', riskScore: 5.5 })).toThrow(
      ValidationError,
    );
  });

  it('rejects an id with disallowed characters', () => {
    expect(() => validateCreateInput({ id: 'has spaces!', fullName: 'Ada', riskScore: 5 })).toThrow(
      ValidationError,
    );
  });

  it('rejects an over-long fullName', () => {
    expect(() => validateCreateInput({ id: '1', fullName: 'x'.repeat(201), riskScore: 5 })).toThrow(
      ValidationError,
    );
  });
});
