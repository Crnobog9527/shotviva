import { z } from 'zod'

import { REQUEST_STATUSES } from './types'
import { DESCRIPTION_MAX, IMAGES_MAX, IMAGES_MIN } from './rules'

// POST /api/wishlist/requests. input_keys are the caller's own uploads from /api/uploads
// (inputs/{user_id}/…); the server re-encodes them into requests/ (ARCHITECTURE §15.1).
export const createRequestSchema = z.object({
  description: z.string().trim().min(1).max(DESCRIPTION_MAX),
  input_keys: z.array(z.string()).min(IMAGES_MIN).max(IMAGES_MAX),
})

export const requestIdSchema = z.uuid()

export const reviewInputSchema = z.discriminatedUnion('action', [
  z.object({ id: requestIdSchema, action: z.literal('approve') }),
  z.object({ id: requestIdSchema, action: z.literal('reject') }),
  z.object({ id: requestIdSchema, action: z.literal('ship'), templateId: z.string().min(1) }),
])

export type ReviewInput = z.infer<typeof reviewInputSchema>

export const requestRowSchema = z.object({
  id: z.string(),
  user_id: z.string(),
  description: z.string(),
  image_keys: z.array(z.string()),
  status: z.enum(REQUEST_STATUSES),
  template_id: z.string().nullable(),
  votes_count: z.number().int(),
  author_label: z.string(),
  created_at: z.string(),
  reviewed_at: z.string().nullable(),
})
