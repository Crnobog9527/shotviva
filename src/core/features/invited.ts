import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'

import { AppError } from '../errors'

// An invite-only feature (registry inviteOnly) is open to an unbanned admin and to the accounts
// invited for it (feature_user_grants, 1342). Never cached: removing an invite takes effect on the
// next request.
export async function isInvited(db: SupabaseClient, userId: string, key: string): Promise<boolean> {
  const [grant, profile] = await Promise.all([
    db.from('feature_user_grants').select('user_id').eq('feature_key', key).eq('user_id', userId).maybeSingle(),
    db.from('profiles').select('role, banned_at').eq('id', userId).maybeSingle(),
  ])
  const failed = grant.error ?? profile.error
  if (failed) throw new AppError('INTERNAL', 'feature invite read failed', { cause: new Error(failed.message) })
  if (profile.data?.banned_at) return false
  return grant.data !== null || profile.data?.role === 'admin'
}
