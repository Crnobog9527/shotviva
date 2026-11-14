import 'server-only'

import { createHash, randomBytes } from 'node:crypto'

import type { SupabaseClient } from '@supabase/supabase-js'

import { AppError } from '../errors'
import { PartnerError } from './partner-error'

// partner_links writes (supabase/migrations/0120_partner_links.sql), service role only.

export const PARTNER = 'graylum'
export const LINK_CODE_TTL_MS = 10 * 60 * 1000

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export const isUuid = (value: string) => UUID.test(value)

// Only the hash is stored, so the table alone cannot be used to link an account.
const hashCode = (code: string) => createHash('sha256').update(code).digest('hex')

const failed = (step: string, message: string) => new AppError('INTERNAL', `partner link ${step} failed: ${message}`)

// "Allow" on /connect/graylum. A new code replaces any pending one; an existing live link
// stays live until the new code is exchanged (which simply re-links the same account).
export async function issueLinkCode(db: SupabaseClient, userId: string, now = new Date()): Promise<string> {
  const code = randomBytes(32).toString('base64url')
  const { error } = await db.from('partner_links').upsert(
    {
      user_id: userId,
      partner: PARTNER,
      link_code: hashCode(code),
      code_expires_at: new Date(now.getTime() + LINK_CODE_TTL_MS).toISOString(),
    },
    { onConflict: 'user_id,partner' },
  )
  if (error) throw failed('issue', error.message)
  return code
}

// POST /api/partner/link. One UPDATE both checks and burns the code: of two concurrent
// exchanges only one matches the row, so a code can never link twice.
export async function exchangeLinkCode(db: SupabaseClient, code: string, now = new Date()): Promise<string> {
  const { data, error } = await db
    .from('partner_links')
    .update({ link_code: null, code_expires_at: null, linked_at: now.toISOString(), revoked_at: null })
    .eq('partner', PARTNER)
    .eq('link_code', hashCode(code))
    .gt('code_expires_at', now.toISOString())
    .select('user_id')
    .returns<{ user_id: string }[]>()
  if (error) throw failed('exchange', error.message)
  const row = data[0]
  if (!row) throw new PartnerError('invalid_input', 'Code is invalid, expired or already used')
  return row.user_id
}

// Account page "Disconnect". Also drops a pending code so it cannot re-link afterwards.
export async function revokeLink(db: SupabaseClient, userId: string, now = new Date()): Promise<void> {
  const { error } = await db
    .from('partner_links')
    .update({ revoked_at: now.toISOString(), link_code: null, code_expires_at: null })
    .eq('user_id', userId)
    .eq('partner', PARTNER)
    .is('revoked_at', null)
  if (error) throw failed('revoke', error.message)
}

export type LinkStatus = { connected: boolean; linkedAt: Date | null }

// Pass the user's own session client: RLS returns only their row (and only safe columns).
export async function readLinkStatus(client: SupabaseClient, userId: string): Promise<LinkStatus> {
  const { data, error } = await client
    .from('partner_links')
    .select('linked_at, revoked_at')
    .eq('user_id', userId)
    .eq('partner', PARTNER)
    .maybeSingle<{ linked_at: string | null; revoked_at: string | null }>()
  if (error) throw failed('read', error.message)
  const connected = Boolean(data?.linked_at) && !data?.revoked_at
  return { connected, linkedAt: connected && data?.linked_at ? new Date(data.linked_at) : null }
}
