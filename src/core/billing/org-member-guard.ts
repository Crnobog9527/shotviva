import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'

import { AppError } from '../errors'

// Staff accounts (Owner 2026-11-22, ARCHITECTURE §6.5): while an account is an active member of an
// enterprise org (owner included) it cannot buy credits or memberships for itself; it generates
// from the org's pools. After the org removes it, it buys like anyone else. Checked by the
// checkout route before any session is created or reused (409 ORG_MEMBER_CHECKOUT).
export async function assertNotOrgMember(admin: SupabaseClient, userId: string): Promise<void> {
  const { data, error } = await admin.from('org_members').select('org_id').eq('user_id', userId).eq('status', 'active').limit(1)
  if (error) throw new AppError('INTERNAL', 'org membership check failed', { cause: new Error(error.message) })
  if (data.length > 0) throw new AppError('ORG_MEMBER_CHECKOUT', 'Active org members buy through their organisation')
}
