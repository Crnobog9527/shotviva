import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'

import { AppError } from '../errors'
import { supportRpc } from './rpc'

const decision = z.enum(['settled', 'refunded'])
const facts = z.object({
  payment: z.string(), order: z.string(), period: z.int(), quoted: z.int(),
  charged: z.int().nullable(), tax: z.int().nullable(), currency: z.string().nullable(),
  reason: z.enum(['amount_mismatch', 'duplicate_payment']), resolution: decision.nullable(), period_paid: z.boolean(),
})
export type RenewalReview = z.infer<typeof facts>

export function loadRenewalReview(db: SupabaseClient, ticketId: string) {
  return supportRpc(db, 'admin_waffo_renewal_review', { p_ticket: ticketId }, facts.nullable())
}

const cents = z.int().nonnegative().max(2147483647)
const inputSchema = z.discriminatedUnion('decision', [
  z.object({ ticketId: z.uuid(), decision: z.literal('settled'), total: cents, tax: cents }).refine(v => v.total > v.tax),
  z.object({ ticketId: z.uuid(), decision: z.literal('refunded') }),
])
export type RenewalDecision = z.infer<typeof inputSchema>

export async function resolveRenewal(db: SupabaseClient, actor: string, input: unknown) {
  const parsed = inputSchema.safeParse(input)
  if (!parsed.success) throw new AppError('INVALID_INPUT', '续费处理信息无效')
  const data = parsed.data
  await supportRpc(db, 'admin_resolve_waffo_renewal', {
    p_actor: actor, p_ticket: data.ticketId, p_decision: data.decision,
    p_total_usd_cents: data.decision === 'settled' ? data.total : null,
    p_tax_usd_cents: data.decision === 'settled' ? data.tax : null,
  }, z.null())
}
