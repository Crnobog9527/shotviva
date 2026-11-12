import { z } from 'zod'

import { NOTE_MAX_LENGTH, OUTPUT_ASPECTS } from '../../src/core/templates/output-options'
import { resolutionSchema } from '../../src/core/templates/db-resolution'

// What `pnpm templates:trial` runs for a template (templates:apply ignores it). Each input set is one
// trial of the admin's 「首次出图」: at most one test photo (a path relative to the batch file), the
// template's copy fields, size, note and toggles. References are style benchmarks shown beside the
// results on the local review page; they are never sent to the model.

const localImage = z.string().min(1).max(500).regex(/\.(jpe?g|png|webp)$/i, 'JPEG, PNG or WebP file')

export const trialInputSchema = z.strictObject({
  photo: localImage.optional(),
  fields: z.record(z.string().max(64), z.string().max(2000)).optional(),
  aspectRatio: z.enum(OUTPUT_ASPECTS).optional(),
  note: z.string().trim().max(NOTE_MAX_LENGTH).optional(),
  toggles: z.record(z.string().max(64), z.boolean()).optional(),
})

export const trialSchema = z.strictObject({
  inputs: z.array(trialInputSchema).min(1).max(10),
  references: z.array(localImage).max(12).optional(),
  // Results per input set.
  n: z.int().min(1).max(5).optional(),
  resolution: resolutionSchema.optional(),
})

export type Trial = z.infer<typeof trialSchema>
export type TrialInput = z.infer<typeof trialInputSchema>
