import { z } from 'zod'

import { apiKeySchema } from '@/core/providers/keys'
import { MODULE_ADAPTER, PROVIDER_ADAPTERS, PROVIDER_MODULES } from '@/core/providers/types'

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

export const saveProviderSchema = z.object({
  // Absent for a new row.
  id: z.uuid().optional(),
  module: z.enum(PROVIDER_MODULES).default('image'),
  adapter: z.enum(PROVIDER_ADAPTERS).default('openai_images'),
  label: z.string().trim().min(1).max(80),
  baseUrl: z.string().trim().min(1).max(300),
  model: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9._:/@+-]{1,120}$/),
  // Write-only: blank keeps the stored key (ARCHITECTURE §3.3).
  apiKey: z.preprocess(blankAsUndefined, apiKeySchema.optional()),
  notes: z.preprocess(blankAsUndefined, z.string().trim().max(500).optional()),
  priceInputTextPerM: pricePerM,
  priceInputImagePerM: pricePerM,
  priceOutputPerM: pricePerM,
})
  // Each module has one adapter (the table check agrees); a mismatched pair is refused.
  .refine((input) => input.adapter === MODULE_ADAPTER[input.module], { path: ['adapter'] })

export type SaveProviderInput = z.input<typeof saveProviderSchema>

export const providerIdSchema = z.object({ id: z.uuid() })
