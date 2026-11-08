import { z } from 'zod'

import { NOTE_MAX_LENGTH, OUTPUT_ASPECTS, RESOLUTIONS } from '@/core/templates'

// Bodies of the admin test-run routes (ARCHITECTURE §10.b, T85). run_id and batch_id are made in
// the browser: a retried request settles to the same run, and the three requests of a ×3 click
// share one batch. Field rules match /api/generate and /api/edit.

export const testGenerateBodySchema = z.object({
  run_id: z.uuid(),
  batch_id: z.uuid(),
  template_id: z.string().min(1).max(64),
  photo_id: z.uuid().nullable().optional(),
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

export const testPhotoTicketSchema = z.object({ content_type: z.string(), size: z.number().int().positive() })
export const testPhotoConfirmSchema = z.object({ key: z.string().min(1).max(200) })
export const testBudgetBodySchema = z.object({ budget_usd: z.number().min(0).max(1000) })
