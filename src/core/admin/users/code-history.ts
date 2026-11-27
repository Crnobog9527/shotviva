import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'

import { AppError } from '../../errors'
import { afterCursor, decodeCursor, PAGE_SIZE, toPage } from '../cursor'

const code = z.object({ id: z.uuid(), code: z.string(), created_at: z.string() })
const blockedAttempt = z.object({
  inviter_user_id: z.uuid().nullable(), status: z.enum(['blocked_same_ip', 'blocked_no_signup_grant']),
  context: z.enum(['signup', 'account', 'paywall']), created_at: z.string(), codes: z.object({ code: z.string() }).nullable(),
})

function blockedInvite(data: unknown) {
  const attempt = blockedAttempt.nullable().parse(data)
  if (!attempt) return null
  return {
    code: attempt.codes?.code ?? null, inviterId: attempt.inviter_user_id, status: attempt.status, at: attempt.created_at,
    // Retried by itself when the signup gift is paid (2030): only a sign-up refusal for the gift.
    retries: attempt.status === 'blocked_no_signup_grant' && attempt.context === 'signup',
  }
}

export async function userCodeHistory(db: SupabaseClient, userId: string, cursor?: string | null) {
  // The kind/time index orders campaigns. The embedded existence check uses (code_id, user_id).
  let campaigns = db.from('codes').select('id,code,created_at,code_redemptions!inner()')
    .eq('kind', 'campaign').eq('code_redemptions.user_id', userId).eq('code_redemptions.status', 'ok')
    .order('created_at', { ascending: false }).order('id', { ascending: false }).limit(PAGE_SIZE + 1)
  const after = decodeCursor(cursor)
  if (after) campaigns = campaigns.or(afterCursor(after))
  // The unique invite-user index also covers an invitation from a subsequently deleted account.
  const invite = db.from('code_redemptions').select('inviter_user_id,codes(code)')
    .eq('user_id', userId).eq('kind', 'invite').eq('status', 'ok').maybeSingle()
  // An invite attempt that was refused (2025 keeps at most one per user): why the account is not
  // attributed, and whether it retries by itself when the signup gift is paid (2030).
  const blocked = db.from('code_redemptions').select('inviter_user_id,status,context,created_at,codes(code)')
    .eq('user_id', userId).eq('kind', 'invite').neq('status', 'ok').maybeSingle()
  const [used, referral, refused] = await Promise.all([campaigns, invite, blocked])
  const failure = used.error ?? referral.error ?? refused.error
  if (failure) throw new AppError('INTERNAL', 'Could not load user code history', { cause: failure })
  const inviter = z.object({ inviter_user_id: z.uuid().nullable(), codes: z.object({ code: z.string() }).nullable() }).nullable().parse(referral.data)
  return {
    inviterId: inviter?.inviter_user_id ?? null,
    inviteCode: inviter?.codes?.code ?? null,
    blockedInvite: blockedInvite(refused.data),
    campaigns: toPage(code.array().parse(used.data), row => ({ id: row.id, code: row.code })),
    paged: Boolean(after),
  }
}
