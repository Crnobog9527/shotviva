import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'
import { checked } from './read'
import { PROMO_TOPUP_MAX, TOPUP_COPY as T } from './promo-topup-copy'

// An ad-hoc top-up (ARCHITECTURE §6.5 渠道商推广积分「临时追加」) → admin_partner_promo_topup
// (migration 1846), which checks the admin again, grants once per request_key and audits it.
// The caller has already passed requireAffiliateAdmin; every answer is a line of TOPUP_COPY.

const topup = z.object({
  org_id: z.uuid(),
  recipient: z.uuid(),
  period: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
  credits: z.string().regex(/^[1-9]\d{0,5}$/),
  reason: z.string().trim().max(500),
  request_key: z.uuid(),
})
const answered = z.object({ applied: z.boolean(), reason: z.string().optional() })
const refusals: Record<string, string> = {
  PROMO_PARTNER_OFF: T.answers.partnerOff,
  ORG_NOT_FOUND: T.answers.invalid,
  INVALID_INPUT: T.answers.invalid,
  IDEMPOTENCY_CONFLICT: T.answers.invalid,
}

export async function topupPromo(db: SupabaseClient, actor: string, form: FormData): Promise<string> {
  const parsed = topup.safeParse(Object.fromEntries(form))
  if (!parsed.success) return T.answers.invalid
  const input = parsed.data
  if (!input.reason) return T.answers.reasonMissing
  if (Number(input.credits) > PROMO_TOPUP_MAX) return T.answers.tooMany
  const answer = await db.rpc('admin_partner_promo_topup', { p_actor: actor, p_input: input })
  const refused = answer.error ? refusals[answer.error.message] : undefined
  if (refused) return refused
  const result = answered.parse(checked(answer))
  if (result.applied) return T.answers.granted
  return result.reason === 'changed' ? T.answers.changed : T.answers.already
}
