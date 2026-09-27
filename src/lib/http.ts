import type { APIGatewayProxyEventHeaders } from 'aws-lambda';

export function headerValue(
  headers: APIGatewayProxyEventHeaders | null | undefined,
  name: string,
): string | undefined {
  if (!headers) return undefined;
  const lower = name.toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === lower) return value ?? undefined;
  }
  return undefined;
}

// Parse an If-Match header into an expected version.
// Returns { any: true } for `*` (any existing version), a number for a specific
// version, or { invalid: true } for a malformed value.
export function parseIfMatch(
  value: string,
): { any: true } | { version: number } | { invalid: true } {
  const v = value.trim();
  if (v === '*') return { any: true };
  const n = Number(v.replace(/"/g, '').trim());
  if (!Number.isInteger(n)) return { invalid: true };
  return { version: n };
}
