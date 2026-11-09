import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { inviteRewards } from './invite-rewards'

export async function readInviteRewards(db: SupabaseClient) {
  const { data, error } = await db.from('system_settings').select('value').eq('key', 'code_invite_rewards').single()
  if (error) throw error
  return inviteRewards.parse(data.value)
}
