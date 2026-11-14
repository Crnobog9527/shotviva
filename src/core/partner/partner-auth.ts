import 'server-only'

import { createHash, timingSafeEqual } from 'node:crypto'

import type { SupabaseClient } from '@supabase/supabase-js'

import type { ServerEnv } from '../env'
import { AppError } from '../errors'
import { logger } from '../logger'
import { PARTNER, isUuid } from './link-code'
import { PartnerError } from './partner-error'
import { PARTNER_ACCOUNT_HEADER } from './partner-types'

// /api/partner/* never uses a user session (ARCHITECTURE §14.3, the AGENTS §6 exception):
// the partner key proves Graylum is calling, X-Shotviva-Account picks a user who linked.

export type PartnerKeyEnv = Pick<ServerEnv, 'GRAYLUM_PARTNER_KEY' | 'VERCEL_ENV'>

// Production keys and preview/dev keys are different kinds, so a preview key can never work
// in production even if the same value were pasted into both environments by mistake.
export const PARTNER_KEY_PREFIX = { production: 'sv_live_', other: 'sv_test_' } as const
const MIN_SECRET_CHARS = 32

export function configuredPartnerKey(env: PartnerKeyEnv): string | null {
  const key = env.GRAYLUM_PARTNER_KEY
  if (!key) return null
  const prefix = env.VERCEL_ENV === 'production' ? PARTNER_KEY_PREFIX.production : PARTNER_KEY_PREFIX.other
  if (!key.startsWith(prefix) || key.length < prefix.length + MIN_SECRET_CHARS) {
    logger.error('GRAYLUM_PARTNER_KEY is the wrong kind for this environment', { expectedPrefix: prefix })
    return null
  }
  return key
}

// Hashing first gives equal-length buffers, so the comparison time says nothing about the key.
const digest = (value: string) => createHash('sha256').update(value).digest()

export function assertPartnerKey(authorization: string | null, env: PartnerKeyEnv): void {
  const expected = configuredPartnerKey(env)
  const presented = /^Bearer (\S+)$/.exec(authorization ?? '')?.[1]
  if (!expected || !presented || !timingSafeEqual(digest(presented), digest(expected))) {
    throw new PartnerError('unauthorized', 'Invalid partner key')
  }
}

// account_id is the user id. Unknown, never-linked and disconnected accounts look the same.
export async function resolvePartnerAccount(db: SupabaseClient, accountId: string | null): Promise<string> {
  if (!accountId || !isUuid(accountId)) throw new PartnerError('link_revoked', 'Account is not linked')
  const { data, error } = await db
    .from('partner_links')
    .select('user_id')
    .eq('user_id', accountId)
    .eq('partner', PARTNER)
    .not('linked_at', 'is', null)
    .is('revoked_at', null)
    .maybeSingle<{ user_id: string }>()
  if (error) throw new AppError('INTERNAL', `partner link lookup failed: ${error.message}`)
  if (!data) throw new PartnerError('link_revoked', 'Account is not linked')
  return data.user_id
}

export async function authenticatePartner(request: Request, deps: { db: SupabaseClient; env: PartnerKeyEnv }): Promise<string> {
  assertPartnerKey(request.headers.get('authorization'), deps.env)
  return resolvePartnerAccount(deps.db, request.headers.get(PARTNER_ACCOUNT_HEADER))
}
