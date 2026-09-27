import { z } from 'zod';

// ---- Reusable, bounded field schemas (domain constraints in one place) ----
// These feed the runtime validator, the API Gateway request model, and the
// generated OpenAPI — all from the same source, so the contract can't diverge.
const idSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9._:-]+$/, 'id may contain only letters, digits, and . _ : -');
const fullNameSchema = z.string().min(1).max(200);
// riskScore is a bounded integer score (0–100 here); adjust per the real domain.
const riskScoreSchema = z.number().int().min(0).max(100);
const sourceSchema = z.string().min(1).max(64);

// ---- Entity schemas ----
// zod is the single source of truth for the runtime shape, the TypeScript types
// (via z.infer), and the OpenAPI components.
export const vendorPayloadSchema = z.object({
  id: idSchema,
  fullName: fullNameSchema,
  riskScore: riskScoreSchema,
  source: sourceSchema,
});
export type VendorPayload = z.infer<typeof vendorPayloadSchema>;

export const prefillRecordSchema = vendorPayloadSchema.extend({
  cachedAt: z.string(),
  version: z.number().int(),
});
export type PrefillRecord = z.infer<typeof prefillRecordSchema>;

// ---- Request input schemas ----
// strictObject => unknown fields are rejected, matching the
// `additionalProperties: false` that toJSONSchema emits, so the edge validator
// and the handler enforce the same contract.
export const createPrefillSchema = z.strictObject({
  id: idSchema,
  fullName: fullNameSchema,
  riskScore: riskScoreSchema,
  source: sourceSchema.optional(),
});
export type CreatePrefillInput = z.infer<typeof createPrefillSchema>;

// PUT replaces the resource, so the body is the create shape without the id.
export const updatePrefillSchema = createPrefillSchema.omit({ id: true });
export type UpdatePrefillInput = z.infer<typeof updatePrefillSchema>;
