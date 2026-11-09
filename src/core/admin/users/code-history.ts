import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'

import { AppError } from '../../errors'
import { afterCursor, decodeCursor, PAGE_SIZE, toPage } from '../cursor'

const code = z.object({ id: z.uuid(), code: z.string(), created_at: z.string() })

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
  const [used, referral] = await Promise.all([campaigns, invite])
  if (used.error || referral.error) throw new AppError('INTERNAL', 'Could not load user code history', { cause: used.error ?? referral.error })
  const inviter = z.object({ inviter_user_id: z.uuid().nullable(), codes: z.object({ code: z.string() }).nullable() }).nullable().parse(referral.data)
  return {
    inviterId: inviter?.inviter_user_id ?? null,
    inviteCode: inviter?.codes?.code ?? null,
    campaigns: toPage(code.array().parse(used.data), row => ({ id: row.id, code: row.code })),
    paged: Boolean(after),
  }
}
