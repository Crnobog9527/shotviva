import { z } from 'zod'

import { cellSchema } from './batch/proof'
import { MAX_BATCH_TEMPLATES } from './batch/limits'
import { MAX_BATCH_SIZE } from '../billing/tier-limits'
import type { Locale } from '../i18n/locales'
import { IMAGE_SLOTS_MAX } from '../templates/image-slots'
import { NOTE_MAX_LENGTH, OUTPUT_ASPECTS, type Resolution } from '../templates/output-options'
import { JOB_VISIBILITIES, type JobSource, type JobVisibility } from './job-schema'
import { resolutionSchema } from '@/core/templates/db-resolution'

// Body of POST /api/generate. job_id is optional and client-made so a retried or
// backgrounded request resolves to the same job instead of charging twice.
export const generateBodySchema = z.object({
  job_id: z.uuid().optional(),
  expected_credits: z.int().positive().optional(),
  template_id: z.string().min(1).max(64),
  input_key: z.string().min(1).max(200).nullable().optional(),
  // A template with image slots (§5.1e): slot key → the caller's upload, filled slots only. Such
  // a template takes no input_key.
  input_slots: z
    .record(z.string().regex(/^[a-z][a-z0-9_]*$/).max(64), z.string().min(1).max(200))
    .refine((slots) => Object.keys(slots).length <= IMAGE_SLOTS_MAX, { message: 'Too many image slots' })
    .optional(),
  inputs: z
    .object({
      copy: z.record(z.string(), z.unknown()).optional(),
      // One of the eight output sizes (DESIGN §4.3); omitted means 'original'.
      aspect_ratio: z.enum(OUTPUT_ASPECTS).optional(),
      // Standard / HD / Max; omitted means '1k'. Anything else is a 422.
      resolution: resolutionSchema.optional(),
      // "Anything to change? (optional)"; blank is the same as absent.
      note: z
        .string()
        .trim()
        .max(NOTE_MAX_LENGTH)
        .transform((note) => note || undefined)
        .optional(),
      // The template's on/off options (T89), key → on; absent keys are off.
      toggles: z.record(z.string().max(64), z.boolean()).optional(),
      // Toggles whose confirm dialog the user accepted; required for any of those that is on.
      toggles_confirmed: z.array(z.string().max(64)).max(10).optional(),
    })
    .default({}),
  visibility: z.enum(JOB_VISIBILITIES).optional(),
  // Preflight counts retained photo/template cells and distinct templates.
  batch_templates: z.int().min(1).max(MAX_BATCH_TEMPLATES).optional(),
  batch_id: z.uuid().optional(),
  batch_cell: cellSchema.optional(),
  batch_size: z.number().int().min(1).max(MAX_BATCH_SIZE).optional(),
  // Dense-text posters (ARCHITECTURE §5.3): which poster of a saved set this job makes.
  // redraw_of: the poster job this one redraws (its first redraw after a failed text check is free).
  poster: z.object({ set_id: z.uuid(), part: z.int().min(0).max(11), redraw_of: z.uuid().optional() }).optional(),
  // Make again (T40): the work the workspace was opened from. Only a claim: the database keeps it
  // only when it is the caller's own succeeded work with the same template (1513).
  again_of: z.uuid().optional(),
})

export type GenerationRequest = {
  userId: string
  source: JobSource
  jobId?: string
  expectedCredits?: number
  templateId: string
  inputKey?: string | null
  // Web only (§5.1e): a slot template's uploads by slot; the partner route has none.
  inputSlots?: Record<string, string>
  copy?: Record<string, unknown>
  aspectRatio?: string
  // Web only: the partner route is fixed at '1k' with no note (ARCHITECTURE §14.6).
  resolution?: Resolution
  note?: string
  // Web only (T89): the partner route never sends toggles, so they stay off there (§14.6).
  toggles?: Record<string, boolean>
  togglesConfirmed?: string[]
  // Applies to paid works only; reserve_credits forces free works public.
  visibility?: JobVisibility | null
  // Partner callId (T7); a repeat returns the first job.
  idempotencyKey?: string | null
  // Web batches only; absent is a single photo (the partner route has no batches, §14.1).
  batchId?: string
  batchTemplates?: number
  batchCell?: z.infer<typeof cellSchema>
  batchSize?: number
  // Language of the page that asked, for the `generate` event only (ARCHITECTURE §16.2).
  locale?: Locale
  // The website request's IP, stored on the job for dispute evidence (T82). Web only.
  clientIp?: string | null
  // A poster template's job: the set and the poster in it; its text is read from the set.
  poster?: { setId: string; part: number; redrawOf?: string }
  // Make again's source work, as the browser claimed it (checked in the database, 1513).
  againOf?: string
}

export function toGenerationRequest(userId: string, body: z.infer<typeof generateBodySchema>): GenerationRequest {
  return {
    userId,
    source: 'web',
    jobId: body.job_id,
    expectedCredits: body.expected_credits,
    templateId: body.template_id,
    inputKey: body.input_key ?? null,
    ...(body.input_slots ? { inputSlots: body.input_slots } : {}),
    copy: body.inputs.copy,
    aspectRatio: body.inputs.aspect_ratio,
    resolution: body.inputs.resolution,
    note: body.inputs.note,
    toggles: body.inputs.toggles,
    togglesConfirmed: body.inputs.toggles_confirmed,
    visibility: body.visibility ?? null,
    batchSize: body.batch_size,
    batchTemplates: body.batch_templates,
    batchId: body.batch_id,
    batchCell: body.batch_cell,
    ...(body.poster ? { poster: { setId: body.poster.set_id, part: body.poster.part, redrawOf: body.poster.redraw_of } } : {}),
    ...(body.again_of ? { againOf: body.again_of } : {}),
  }
}
