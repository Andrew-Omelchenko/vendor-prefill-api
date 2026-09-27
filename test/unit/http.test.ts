import type { APIGatewayProxyEventHeaders } from 'aws-lambda';
import { headerValue, parseIfMatch } from '../../src/lib/http';

describe('headerValue', () => {
  const headers: APIGatewayProxyEventHeaders = { 'If-Match': '"3"', 'X-Empty': undefined };
  it('matches case-insensitively', () => {
    expect(headerValue(headers, 'if-match')).toBe('"3"');
  });
  it('returns undefined for a missing header', () => {
    expect(headerValue(headers, 'authorization')).toBeUndefined();
  });
  it('returns undefined when headers are absent', () => {
    expect(headerValue(undefined, 'if-match')).toBeUndefined();
    expect(headerValue(null, 'if-match')).toBeUndefined();
  });
  it('returns undefined for a present-but-empty value', () => {
    expect(headerValue(headers, 'x-empty')).toBeUndefined();
  });
});

describe('parseIfMatch', () => {
  it('treats * as any version', () => {
    expect(parseIfMatch('*')).toEqual({ any: true });
  });
  it('parses a quoted version', () => {
    expect(parseIfMatch('"7"')).toEqual({ version: 7 });
  });
  it('parses an unquoted integer', () => {
    expect(parseIfMatch('12')).toEqual({ version: 12 });
  });
  it('rejects a non-numeric value', () => {
    expect(parseIfMatch('abc')).toEqual({ invalid: true });
  });
  it('rejects a non-integer value', () => {
    expect(parseIfMatch('1.5')).toEqual({ invalid: true });
  });
});
