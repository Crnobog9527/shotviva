import { z } from 'zod'

// Shotviva partner API contract (ARCHITECTURE §14.6). This file is the whole contract: it is
// copied verbatim into Graylum, so it imports nothing but zod (v4) and holds no logic.
//
// Every route authenticates with
//   Authorization: Bearer <partner key>        one key per environment; a preview key is
//                                              rejected in production
//   X-Shotviva-Account: <account_id>           every route except POST /api/partner/link
// JSON is snake_case. Errors are always `partnerErrorSchema`.

export const PARTNER_ACCOUNT_HEADER = 'X-Shotviva-Account'
export const PARTNER_IDEMPOTENCY_HEADER = 'Idempotency-Key'

// ---------------------------------------------------------------- errors

export const PARTNER_ERROR_CODES = [
  'unauthorized', // 401 wrong, missing or other-environment partner key
  'link_revoked', // 401 account not linked, or the user disconnected Graylum: clear the account id
  'invalid_input', // 422 bad body, unknown field, bad image URL / image, bad return_to, bad code
  'quota_exhausted', // 402 out of credits; send the user to top_up_url
  'content_rejected', // 422 the image model's own safety refusal; nothing charged
  'generation_failed', // 500 provider or storage failure; credits already refunded
  'rate_limited', // 429 per-account generation limit; retry in a few minutes
  'not_found', // 404 unknown template or job
  'internal', // 500
] as const

export type PartnerErrorCode = (typeof PARTNER_ERROR_CODES)[number]

export const partnerErrorSchema = z.object({
  code: z.enum(PARTNER_ERROR_CODES),
  message: z.string(),
  // quota_exhausted only.
  top_up_url: z.url().optional(),
  // Failures of a job that was created (content_rejected / generation_failed).
  job_id: z.uuid().optional(),
  refunded: z.boolean().optional(),
})

export type PartnerErrorBody = z.infer<typeof partnerErrorSchema>

// ---------------------------------------------------------------- shared

// Graylum's callId. Same key → same job, charged once (also the timeout fallback: replaying
// the POST answers with the job's current state instead of generating again).
export const idempotencyKeySchema = z
  .string()
  .min(1)
  .max(200)
  .regex(/^[\x21-\x7e]+$/, 'printable ASCII, no spaces')

// Where to send the user after a top-up. Must be https on an allowlisted Graylum host.
const returnTo = z.url().max(2048)

export const PARTNER_JOB_STATUSES = ['running', 'succeeded', 'failed'] as const
export type PartnerJobStatus = (typeof PARTNER_JOB_STATUSES)[number]

// ---------------------------------------------------------------- POST /api/partner/link

// The one-time code from the connect redirect: valid 10 minutes, usable once.
export const linkRequestSchema = z.object({ code: z.string().min(16).max(128) })

export const linkResponseSchema = z.object({
  account_id: z.uuid(),
  // Masked email (e.g. "j***@gmail.com"), for "Connected as …".
  display_name: z.string(),
  credits_remaining: z.number().int().nonnegative(),
})

// ---------------------------------------------------------------- GET /api/partner/account

export const accountQuerySchema = z.object({ return_to: returnTo.optional() })

export const accountResponseSchema = z.object({
  credits_remaining: z.number().int().nonnegative(),
  // ISO timestamp; paid (private, no watermark) while in the future. null = free.
  paid_until: z.string().nullable(),
  top_up_url: z.url(),
})

// ---------------------------------------------------------------- GET /api/partner/templates

export const partnerTemplateFieldsSchema = z.object({
  // How many images the template takes; send at most one, as `image`.
  images: z.object({ min: z.number().int(), max: z.number().int() }),
  copy: z.array(
    z.object({ key: z.string(), label: z.string(), required: z.boolean(), max_length: z.number().int() }),
  ),
  // First entry is the default.
  aspect_ratios: z.array(z.string()).min(1),
})

export const partnerTemplateSchema = z.object({
  // `freeform` is the free-text template: copy.prompt + optional image.
  id: z.string(),
  name: z.string(),
  category: z.string(),
  cover_before_url: z.url().nullable(),
  cover_after_url: z.url().nullable(),
  credits_cost: z.number().int().positive(),
  fields: partnerTemplateFieldsSchema,
})

export const templatesResponseSchema = z.object({ templates: z.array(partnerTemplateSchema) })

// ---------------------------------------------------------------- POST /api/partner/generate
// Synchronous (up to ~300s). Requires the Idempotency-Key header.

export const generateRequestSchema = z.object({
  template_id: z.string().min(1).max(64),
  inputs: z
    .object({
      // Keys from the template's fields.copy; freeform uses { prompt }.
      copy: z.record(z.string(), z.string()).default({}),
      aspect_ratio: z.string().max(8).optional(),
    })
    .default({ copy: {} }),
  // Optional reference image: https, allowlisted Graylum host, ≤20MB JPEG/PNG/WebP.
  // Shotviva fetches it (no redirects) and downsizes it to a 2048 long edge.
  image: z.url().max(2048).optional(),
  return_to: returnTo.optional(),
})

export const generateResponseSchema = z.object({
  job_id: z.uuid(),
  // 'running' (HTTP 202) only when a replayed Idempotency-Key finds the job still in flight.
  status: z.enum(['running', 'succeeded']),
  // Signed, valid 7 days. null while running.
  image_url: z.url().nullable(),
  credits_charged: z.number().int().nonnegative(),
  credits_remaining: z.number().int().nonnegative(),
})

// ---------------------------------------------------------------- GET /api/partner/jobs/{id}

export const jobResponseSchema = z.object({
  job_id: z.uuid(),
  status: z.enum(PARTNER_JOB_STATUSES),
  template_id: z.string(),
  image_url: z.url().nullable(),
  // 0 once a failed job was refunded.
  credits_charged: z.number().int().nonnegative(),
  error: z.enum(['content_rejected', 'generation_failed']).nullable(),
  created_at: z.string(),
  finished_at: z.string().nullable(),
})

// ---------------------------------------------------------------- inferred types

export type LinkRequest = z.input<typeof linkRequestSchema>
export type LinkResponse = z.infer<typeof linkResponseSchema>
export type AccountQuery = z.input<typeof accountQuerySchema>
export type AccountResponse = z.infer<typeof accountResponseSchema>
export type PartnerTemplate = z.infer<typeof partnerTemplateSchema>
export type TemplatesResponse = z.infer<typeof templatesResponseSchema>
export type GenerateRequest = z.input<typeof generateRequestSchema>
export type GenerateResponse = z.infer<typeof generateResponseSchema>
export type JobResponse = z.infer<typeof jobResponseSchema>
