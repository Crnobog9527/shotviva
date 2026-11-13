import { z } from 'zod'

import { ARK_RESOLUTIONS } from '@/core/providers/ark'
import { apiKeySchema } from '@/core/providers/keys'
import { estimatedImageCostsSchema } from '@/core/templates/image-capabilities'
import { RESOLUTIONS } from '@/core/templates/output-options'
import { MODULE_ADAPTERS, PROVIDER_ADAPTERS, PROVIDER_MODULES } from '@/core/providers/types'
import { resolutionSchema } from '@/core/templates/db-resolution'

// Admin input for /admin/providers. Validated again on the server before anything is stored.

// Trims, and treats blank as absent. A pasted key often carries a trailing space or newline.
const blankAsUndefined = (value: unknown) => {
  if (typeof value !== 'string') return value
  const trimmed = value.trim()
  return trimmed === '' ? undefined : trimmed
}

// US dollars per million tokens (T33). Blank means "not filled in" and is stored as null; the
// page flags it. numeric(12, 6) in ai_providers.
const pricePerM = z.preprocess(
  (value) => blankAsUndefined(value) ?? null,
  z.coerce.number().finite().nonnegative().max(999_999).nullable(),
)

const modelFields = {
  baseUrl: z.string().trim().min(1).max(300),
  model: z.string().trim().regex(/^[A-Za-z0-9._:/@+-]{1,120}$/),
}
export const lookupModelSchema = z.object({ ...modelFields, retry: z.boolean().optional() })

export const saveProviderSchema = z.object({
  // Absent for a new row.
  id: z.uuid().optional(),
  module: z.enum(PROVIDER_MODULES).default('image'),
  adapter: z.enum(PROVIDER_ADAPTERS).default('openai_images'),
  // Older editors omit tiers. Inserts use the database default; edits keep the saved set.
  resolutions: z.array(resolutionSchema).min(1).max(RESOLUTIONS.length)
    .refine((values) => new Set(values).size === values.length).optional(),
  estimatedImageCosts: estimatedImageCostsSchema.optional(),
  label: z.string().trim().min(1).max(80),
  ...modelFields,
  // Write-only: blank keeps the stored key (ARCHITECTURE §3.3).
  apiKey: z.preprocess(blankAsUndefined, apiKeySchema.optional()),
  notes: z.preprocess(blankAsUndefined, z.string().trim().max(500).optional()),
  priceInputTextPerM: pricePerM,
  priceInputImagePerM: pricePerM,
  priceOutputPerM: pricePerM,
})
  .refine((input) => MODULE_ADAPTERS[input.module].some((adapter) => adapter === input.adapter), { path: ['adapter'] })
  // Ark's sale floor has no list price to fall back on: until it has measured samples it uses these
  // per-image estimates, so every tier it offers needs one (the form enforces the same).
  .refine((input) => input.adapter !== 'ark_images' || ARK_RESOLUTIONS.every((tier) => (input.estimatedImageCosts?.[tier] ?? 0) > 0),
    { path: ['estimatedImageCosts'] })

export type SaveProviderInput = z.input<typeof saveProviderSchema>

export const providerIdSchema = z.object({ id: z.uuid() })
