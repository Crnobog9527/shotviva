import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'
import { checked } from './read'

// Go-live of commissions net of fees (ARCHITECTURE §6.2 订单手续费 · 上线): one admin action, after
// an explicit confirmation, sets payment_fee_settings.record_from to now and the affiliate terms
// to the newest published version, together (1820 admin_payment_fees_start). One-way.

export type StartAnswer = 'feesStarted' | 'feesAlreadyStarted' | 'feesStartedOther' | 'feesStartChanged' | 'feesConfirmMissing'

const input = z.object({
  confirm: z.literal('on'),
  expected_record_from: z.string().max(64).default(''),
  expected_terms_version: z.string().trim().min(1).max(40),
})
const result = z.object({ applied: z.boolean(), reason: z.string().optional() })
const refusals: Record<string, StartAnswer> = {
  PAYMENT_FEES_ALREADY_STARTED: 'feesStartedOther',
  PAYMENT_FEES_START_CHANGED: 'feesStartChanged',
}

/** The start form → admin_payment_fees_start. `latestTerms` is the newest published version. */
export async function startPaymentFees(db: SupabaseClient, actor: string, form: FormData, latestTerms: string): Promise<StartAnswer> {
  const parsed = input.safeParse(Object.fromEntries(form))
  if (!parsed.success) return 'feesConfirmMissing'
  const { expected_record_from, expected_terms_version } = parsed.data
  const answer = await db.rpc('admin_payment_fees_start', {
    p_actor: actor,
    p_input: { terms_version: latestTerms, expected_record_from: expected_record_from || null, expected_terms_version },
  })
  const refused = answer.error ? refusals[answer.error.message] : undefined
  if (refused) return refused
  return result.parse(checked(answer)).applied ? 'feesStarted' : 'feesAlreadyStarted'
}

/** What the start card shows. */
export async function feesStartState(db: SupabaseClient) {
  const fees = z.object({ record_from: z.string().nullable() }).parse(checked(await db.from('payment_fee_settings').select('record_from').single()))
  const terms = z.object({ terms_version: z.string() }).parse(checked(await db.from('affiliate_settings').select('terms_version').single()))
  return { recordFrom: fees.record_from, termsVersion: terms.terms_version }
}
