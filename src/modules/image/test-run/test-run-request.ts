import { z } from 'zod'

import { NOTE_MAX_LENGTH, OUTPUT_ASPECTS, RESOLUTIONS } from '@/core/templates'

// Bodies of the admin test-run routes (ARCHITECTURE §10.b, T85). run_id and batch_id are made in
// the browser: a retried request settles to the same run, and the three requests of a ×3 click
// share one batch. Field rules match /api/generate and /api/edit.

export const testGenerateBodySchema = z.object({
  run_id: z.uuid(),
  batch_id: z.uuid(),
  template_id: z.string().min(1).max(64),
  // Absent follows the saved template; explicit null uses the global default.
  provider_id: z.uuid().nullable().optional(),
  photo_id: z.uuid().nullable().optional(),
  // A template with image slots (§5.1e): slot key → test photo, filled slots only.
  slot_photos: z.record(z.string().regex(/^[a-z][a-z0-9_]*$/).max(64), z.uuid()).optional(),
  omit_style_refs: z.boolean().optional(),
  inputs: z
    .object({
      copy: z.record(z.string(), z.unknown()).optional(),
      aspect_ratio: z.enum(OUTPUT_ASPECTS).optional(),
      resolution: z.enum(RESOLUTIONS).optional(),
      note: z
        .string()
        .trim()
        .max(NOTE_MAX_LENGTH)
        .transform((note) => note || undefined)
        .optional(),
      // The template's toggles (T89); an admin turns one on without the user's confirm dialog.
      toggles: z.record(z.string().max(64), z.boolean()).optional(),
    })
    .default({}),
})

export const testEditBodySchema = z.object({
  run_id: z.uuid(),
  batch_id: z.uuid(),
  parent_id: z.uuid(),
  instruction: z.string().max(2000),
  resolution: z.enum(RESOLUTIONS).optional(),
  aspect_ratio: z.enum(OUTPUT_ASPECTS).optional(),
})

// 「生成其他语言版本」 (T87): one target language per request; a batch of languages is several.
const localeCode = z.string().regex(/^[a-z]{2,3}(-[a-z0-9]{2,8})?$/)
export const testTranslateBodySchema = z.object({
  run_id: z.uuid(),
  batch_id: z.uuid(),
  template_id: z.string().min(1).max(64),
  // null: translate the common cover's "after".
  source_locale: localeCode.nullable(),
  target_locale: localeCode,
  resolution: z.enum(RESOLUTIONS).optional(),
})

// 「设为封面」: null / absent sets the common cover, a code that language's own (T87).
export const testCoverBodySchema = z.object({ locale: localeCode.nullable().optional() })

export const testPhotoTicketSchema = z.object({ content_type: z.string(), size: z.number().int().positive() })
export const testPhotoConfirmSchema = z.object({ key: z.string().min(1).max(200) })
export const testBudgetBodySchema = z.object({ budget_usd: z.number().min(0).max(1000) })
