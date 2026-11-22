import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'
import { checked } from './read'
import { PROMO_COPY as P } from './promo-copy'

// Admin writes for promotion credits (ARCHITECTURE §6.5 渠道商推广积分): one RPC each (migrations
// 1842–1843, 1920), all audited there. Every answer is a line of PROMO_COPY for the form's status.

const decision = z.object({
  grant_id: z.string().regex(/^[1-9]\d{0,17}$/),
  decision: z.enum(['confirm', 'reject', 'recompute']),
  fingerprint: z.string().regex(/^[0-9a-f]{32}$/).optional(),
  note: z.string().trim().max(500).optional(),
})
const decided = z.object({ applied: z.boolean(), reason: z.string().optional() })
const refusals: Record<string, string> = {
  PROMO_GRANT_DECIDED: P.answers.decided,
  PROMO_GRANT_EXPIRED: P.answers.expired,
  PROMO_GRANT_NOT_FOUND: P.answers.invalid,
  PROMO_PARTNER_OFF: P.answers.partnerOff,
  INVALID_INPUT: P.answers.invalid,
}

function answerOf(choice: string, result: z.infer<typeof decided>): string {
  if (!result.applied) return (P.answers as Record<string, string>)[result.reason ?? 'decided'] ?? P.answers.decided
  if (choice === 'confirm') return P.answers.granted
  return choice === 'reject' ? P.answers.rejected : P.answers.recomputed
}

/** A confirm / reject / recompute form → admin_partner_promo_decide. */
export async function decidePromo(db: SupabaseClient, actor: string, form: FormData): Promise<string> {
  const parsed = decision.safeParse(Object.fromEntries(form))
  if (!parsed.success) return P.answers.invalid
  const input = parsed.data
  if (input.decision === 'reject' && !input.note) return P.answers.noteMissing
  const answer = await db.rpc('admin_partner_promo_decide', { p_actor: actor, p_input: input })
  const refused = answer.error ? refusals[answer.error.message] : undefined
  if (refused) return refused
  return answerOf(input.decision, decided.parse(checked(answer)))
}

const voiding = z.object({ grant_id: z.string().regex(/^[1-9]\d{0,17}$/), reason: z.string().trim().max(500).optional() })
const voidRefusals: Record<string, string> = {
  PROMO_GRANT_NOT_GRANTED: P.answers.notGranted,
  PROMO_GRANT_EXPIRED: P.answers.voidExpired,
  PROMO_GRANT_CLAWED: P.answers.voidClawed,
  PROMO_GRANT_NOT_FOUND: P.answers.invalid,
  INVALID_INPUT: P.answers.invalid,
}

/** Void a granted sheet whose credits were already handled by hand → admin_partner_promo_void (1920). Moves no credits. */
export async function voidPromo(db: SupabaseClient, actor: string, form: FormData): Promise<string> {
  const parsed = voiding.safeParse(Object.fromEntries(form))
  if (!parsed.success) return P.answers.invalid
  const { grant_id, reason } = parsed.data
  if (!reason) return P.answers.voidReasonMissing
  const answer = await db.rpc('admin_partner_promo_void', { p_actor: actor, p_input: { grant_id, reason } })
  const refused = answer.error ? voidRefusals[answer.error.message] : undefined
  if (refused) return refused
  return decided.parse(checked(answer)).applied ? P.answers.voided : P.answers.alreadyVoided
}

const mark = z.object({ org_id: z.uuid(), on: z.enum(['true', 'false']) })

/** The partner switch of one org → admin_partner_promo_set. */
export async function setPromoPartner(db: SupabaseClient, actor: string, form: FormData): Promise<string> {
  const parsed = mark.safeParse(Object.fromEntries(form))
  if (!parsed.success) return P.answers.invalid
  const answer = await db.rpc('admin_partner_promo_set', { p_actor: actor, p_input: { org_id: parsed.data.org_id, on: parsed.data.on === 'true' } })
  if (answer.error?.message === 'PROMO_PARTNER_NEEDS_AFFILIATE') return P.needsAffiliate
  checked(answer)
  return P.marked
}

const ran = z.object({ sheets: z.number(), pending: z.number(), failed_orgs: z.array(z.unknown()) })

/** "Generate now" → admin_partner_promo_run (the monthly run for the current UTC month). */
export async function runPromoNow(db: SupabaseClient, actor: string): Promise<string> {
  const result = ran.parse(checked(await db.rpc('admin_partner_promo_run', { p_actor: actor })))
  if (result.failed_orgs.length) return P.runFailed(result.failed_orgs.length)
  return P.ran(result.sheets, result.pending)
}
