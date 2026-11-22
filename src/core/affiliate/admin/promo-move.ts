import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'
import { logger } from '@/core/logger'
import { MOVE_COPY, type MovePreview } from './promo-move-copy'
import { checked } from './read'

// The one-off move of this month's old promotion grants (ARCHITECTURE §6.5 企业推广积分池「迁移旧发放」,
// migration 1895): grants confirmed before the promo pool existed sit in the org owner's own free
// pool; an admin moves what is still unspent into the org's promo pool with one explicit click.
// admin_partner_promo_move checks the admin again, moves once (a second click answers 'nothing')
// and refuses an amount that is no longer the one the page showed ('changed').

const preview = z.object({ period: z.string(), credits: z.coerce.number().int(), moved: z.coerce.number().int() })


/** What a move would take now for one org; null when it cannot be read (the card then hides the block). */
export async function movePreview(db: SupabaseClient, actor: string, orgId: string): Promise<MovePreview | null> {
  const { data, error } = await db.rpc('admin_partner_promo_move_preview', { p_actor: actor, p_org: orgId })
  const parsed = preview.safeParse(data)
  if (error || !parsed.success) {
    logger.warn('promo move preview unavailable', { code: error?.code })
    return null
  }
  return parsed.data
}

const form = z.object({ org_id: z.uuid(), credits: z.string().regex(/^\d{1,9}$/) })
const answered = z.object({ applied: z.boolean(), reason: z.string().optional() })
const refusals: Record<string, string> = {
  PROMO_PARTNER_OFF: MOVE_COPY.answers.partnerOff,
  ORG_NOT_FOUND: MOVE_COPY.answers.invalid,
  INVALID_INPUT: MOVE_COPY.answers.invalid,
}

export async function movePromo(db: SupabaseClient, actor: string, data: FormData): Promise<string> {
  const parsed = form.safeParse(Object.fromEntries(data))
  if (!parsed.success) return MOVE_COPY.answers.invalid
  const answer = await db.rpc('admin_partner_promo_move', { p_actor: actor, p_input: { org_id: parsed.data.org_id, credits: Number(parsed.data.credits) } })
  const refused = answer.error ? refusals[answer.error.message] : undefined
  if (refused) return refused
  const result = answered.parse(checked(answer))
  if (result.applied) return MOVE_COPY.answers.applied
  return result.reason === 'changed' ? MOVE_COPY.answers.changed : MOVE_COPY.answers.nothing
}
