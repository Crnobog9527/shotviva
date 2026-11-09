import { z } from 'zod'

import { MAX_BATCH_SIZE } from '../billing/tier-limits'
import type { Locale } from '../i18n/locales'
import { NOTE_MAX_LENGTH, OUTPUT_ASPECTS, RESOLUTIONS, type Resolution } from '../templates/output-options'
import { JOB_VISIBILITIES, type JobSource, type JobVisibility } from './job-schema'

// Body of POST /api/generate. job_id is optional and client-made so a retried or
// backgrounded request resolves to the same job instead of charging twice.
export const generateBodySchema = z.object({
  job_id: z.uuid().optional(),
  expected_credits: z.int().positive().optional(),
  template_id: z.string().min(1).max(64),
  input_key: z.string().min(1).max(200).nullable().optional(),
  inputs: z
    .object({
      copy: z.record(z.string(), z.unknown()).optional(),
      // One of the eight output sizes (DESIGN §4.3); omitted means 'original'.
      aspect_ratio: z.enum(OUTPUT_ASPECTS).optional(),
      // Standard / HD / Max; omitted means '1k'. Anything else is a 422.
      resolution: z.enum(RESOLUTIONS).optional(),
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
  // How many photos the workspace sent in this batch, this one included (ARCHITECTURE §6.2
  // "批量上传的语义"): checked against the tier's batchMax and sent with `generate`. Not stored.
  batch_size: z.number().int().min(1).max(MAX_BATCH_SIZE).optional(),
})

export type GenerationRequest = {
  userId: string
  source: JobSource
  jobId?: string
  expectedCredits?: number
  templateId: string
  inputKey?: string | null
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
  batchSize?: number
  // Language of the page that asked, for the `generate` event only (ARCHITECTURE §16.2).
  locale?: Locale
  // The website request's IP, stored on the job for dispute evidence (T82). Web only.
  clientIp?: string | null
}

export function toGenerationRequest(userId: string, body: z.infer<typeof generateBodySchema>): GenerationRequest {
  return {
    userId,
    source: 'web',
    jobId: body.job_id,
    expectedCredits: body.expected_credits,
    templateId: body.template_id,
    inputKey: body.input_key ?? null,
    copy: body.inputs.copy,
    aspectRatio: body.inputs.aspect_ratio,
    resolution: body.inputs.resolution,
    note: body.inputs.note,
    toggles: body.inputs.toggles,
    togglesConfirmed: body.inputs.toggles_confirmed,
    visibility: body.visibility ?? null,
    batchSize: body.batch_size,
  }
}
