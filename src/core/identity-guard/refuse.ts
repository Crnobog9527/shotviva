import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'

import { track as defaultTrack, type ServerTrack } from '../analytics'
import { AppError } from '../errors'
import { DEFAULT_LOCALE, type Locale } from '../i18n/locales'
import { logger } from '../logger'
import type { IdentityEntry, IdentityJudgeUsage, RefusalMethod } from './judge'

// What a refusal leaves behind (ARCHITECTURE §5.1a 「留痕」): one row in identity_refusals with
// the first 200 characters of what was typed (0701 keeps them 90 days), and a `generate_refused`
// event that carries no text, both once per batch. Neither may stop the refusal itself.

export const EXCERPT_MAX = 200

// quiet: an admin test run (T85) is refused exactly the same, but leaves no identity_refusals row
// (the admin's own account would be flagged) and no event (§10.b keeps test runs out of PostHog).
export type RefusalDeps = { db: SupabaseClient; track?: ServerTrack; quiet?: boolean }

// usage: what the decision call that refused it cost; no job carries it, so the row does.
export type Refusal = { userId: string; entry: IdentityEntry; method: RefusalMethod; text: string; locale?: Locale; usage?: IdentityJudgeUsage | null }

// Counted in code points, as Postgres' char_length counts them, so an emoji is never cut in half.
export const excerptOf = (text: string) => Array.from(text.trim()).slice(0, EXCERPT_MAX).join('')

// Whether this is a new refusal: false when the same words from the same entry were refused in
// the last 10 minutes (each photo of one batch asks on its own; 0701 counts them once). A failed
// write still counts as new, so the event is not lost with the row.
async function record(db: SupabaseClient, refusal: Refusal): Promise<boolean> {
  const { data, error } = await db.rpc('record_identity_refusal', {
    p_user_id: refusal.userId,
    p_entry: refusal.entry,
    p_method: refusal.method,
    p_excerpt: excerptOf(refusal.text),
    p_input_tokens: refusal.usage?.inputTokens ?? null,
    p_output_tokens: refusal.usage?.outputTokens ?? null,
  })
  if (!error) return data !== false
  logger.error('identity refusal not recorded', { entry: refusal.entry, error: new Error(error.message) })
  return true
}

export class IdentitySwapRefused extends AppError {
  constructor() {
    super('IDENTITY_SWAP_REFUSED', 'Shotviva cannot swap faces or turn a person into someone else')
  }
}

// Records, tracks, then throws: always before any credit is reserved, so nothing is charged.
export async function refuseIdentitySwap(deps: RefusalDeps, refusal: Refusal): Promise<never> {
  // The user's words stay out of the log line; the row holds the excerpt for the Owner.
  logger.info('identity swap refused', { userId: refusal.userId, entry: refusal.entry, method: refusal.method, quiet: deps.quiet === true })
  if (!deps.quiet && (await record(deps.db, refusal))) {
    const track = deps.track ?? defaultTrack
    track('generate_refused', { reason: 'identity_swap', source: refusal.entry }, { distinctId: refusal.userId, locale: refusal.locale ?? DEFAULT_LOCALE })
  }
  throw new IdentitySwapRefused()
}
