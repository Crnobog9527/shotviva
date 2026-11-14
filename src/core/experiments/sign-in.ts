import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'

import { logger } from '../logger'
import { EXPERIMENT_COOKIE, EXPERIMENT_COOKIE_MAX_AGE, parseExperimentCookie, serializeExperimentCookie, type CookieEntry } from './cookie'

// At a verified sign-in (ARCHITECTURE §16.5): the browser's A/B assignments are stored on the
// account (experiment_sign_in, 1544), and the account's assignments come back into the cookie, so
// the same person sees the same variant on every device and later on the paywall. Rows written by
// the sign-up itself are the ones results count as sign-ups. Never throws: a sign-in must not fail
// for an experiment.

const rowsSchema = z.array(z.object({ experiment: z.number().int(), current: z.number().int(), first: z.number().int() }))

export type CookieJar = {
  get: (name: string) => { value: string } | undefined
  set: (name: string, value: string, options: { path: string; maxAge: number; sameSite: 'lax'; secure: boolean }) => unknown
}

// Account rows replace the browser's entries; a flag stays only when the variant did not change.
export function mergeAccountRows(entries: Map<number, CookieEntry>, rows: z.infer<typeof rowsSchema>): Map<number, CookieEntry> {
  const merged = new Map(entries)
  for (const row of rows) {
    const held = entries.get(row.experiment)
    const flag = held && held.current === row.current ? held.flag : ''
    merged.set(row.experiment, { experiment: row.experiment, current: row.current, first: row.first, flag })
  }
  return merged
}

// `<experiment>:<first variant>` of the counted entries, for the signup event.
export function signupExperiments(entries: Map<number, CookieEntry>): string | undefined {
  const pairs = [...entries.values()].filter((entry) => entry.flag !== 'f').map((entry) => `${entry.experiment}:${entry.first}`)
  return pairs.length ? pairs.join(',') : undefined
}

export async function syncExperimentsAtSignIn(admin: SupabaseClient, userId: string, signup: boolean, jar: CookieJar, secure: boolean): Promise<Map<number, CookieEntry>> {
  const entries = parseExperimentCookie(jar.get(EXPERIMENT_COOKIE)?.value)
  try {
    const pairs = [...entries.values()].filter((entry) => entry.flag !== 'f').map(({ experiment, current, first }) => ({ experiment, current, first }))
    const { data, error } = await admin.rpc('experiment_sign_in', { p_user: userId, p_pairs: pairs, p_signup: signup })
    if (error) throw new Error(error.message)
    const merged = mergeAccountRows(entries, rowsSchema.parse(data))
    if (merged.size > 0) {
      jar.set(EXPERIMENT_COOKIE, serializeExperimentCookie(merged.values()), { path: '/', maxAge: EXPERIMENT_COOKIE_MAX_AGE, sameSite: 'lax', secure })
    }
    return merged
  } catch (error) {
    logger.warn('experiments.sign_in_sync_failed', { error })
    return entries
  }
}
