import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'

import { AppError } from '../errors'

// Staff accounts (Owner 2026-11-22, ARCHITECTURE §6.5): an account that signed up through an org's
// staff link (signup_gift_refusal = 'staff', 1940) gets no new-user reward, now or after the org
// removes it: no new_users_only campaign code and no invite code. Other codes (a discount for a
// later checkout, a plain gift code) work as for anyone. Invite codes are refused by redeem_code
// as well (blocked_no_signup_grant); this covers new_users_only campaign codes. `code` is the
// normalized code. Fails closed: a failed lookup refuses nothing silently, it throws.
// Only a staff-link account's codes are looked up; everyone else costs one profile read.
export async function staffNewUserCode(admin: SupabaseClient, userId: string, code: string): Promise<boolean> {
  const profile = await admin.from('profiles').select('signup_gift_refusal').eq('id', userId).maybeSingle<{ signup_gift_refusal: string | null }>()
  if (profile.error) throw new AppError('INTERNAL', 'staff code check failed', { cause: new Error(profile.error.message) })
  if (profile.data?.signup_gift_refusal !== 'staff') return false
  const offer = await admin.from('codes').select('kind, new_users_only').eq('code', code.toUpperCase()).maybeSingle<{ kind: string; new_users_only: boolean }>()
  if (offer.error) throw new AppError('INTERNAL', 'staff code check failed', { cause: new Error(offer.error.message) })
  return offer.data !== null && (offer.data.new_users_only || offer.data.kind === 'invite')
}
