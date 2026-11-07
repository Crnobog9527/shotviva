import { z } from 'zod'

// A payment_disputes row as admin_list_disputes / admin_get_dispute (0729) answer it.
const time = z.string().transform((value) => new Date(value))

export const disputeRowSchema = z.object({
  stripe_dispute_id: z.string(),
  stripe_charge_id: z.string(),
  payment_id: z.number().int().nullable(),
  user_id: z.uuid().nullable(),
  email: z.string().nullable(),
  product_id: z.string().nullable(),
  amount: z.number().int(),
  currency: z.string(),
  reason: z.string(),
  responder: z.enum(['shotviva', 'stripe']),
  due_by: time.nullable(),
  auto_banned_at: time.nullable(),
  evidence_drafted_at: time.nullable(),
  submitted_at: time.nullable(),
  reminded_at: time.nullable(),
  created_at: time,
})

export type DisputeRow = z.output<typeof disputeRowSchema>
