import {
  createPrefillSchema,
  updatePrefillSchema,
  type CreatePrefillInput,
  type UpdatePrefillInput,
} from './schemas';
import { ValidationError } from './errors';

function firstIssueMessage(error: import('zod').ZodError): string {
  const first = error.issues[0];
  const path = first.path.join('.') || '(body)';
  return `${path}: ${first.message}`;
}

// Handler-side validation (defense in depth). API Gateway validates at the edge
// too, but we never fully trust the boundary, and this gives us a typed value.
export function validateCreateInput(body: unknown): CreatePrefillInput {
  const result = createPrefillSchema.safeParse(body);
  if (!result.success) throw new ValidationError(firstIssueMessage(result.error));
  return result.data;
}

export function validateUpdateInput(body: unknown): UpdatePrefillInput {
  const result = updatePrefillSchema.safeParse(body);
  if (!result.success) throw new ValidationError(firstIssueMessage(result.error));
  return result.data;
}
