import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'

import { AppError } from '../errors'

// Staff accounts (Owner 2026-11-22, ARCHITECTURE §6.5): while an account is an active staff member
// of an enterprise org (role 'member') it cannot buy credits or memberships for itself; it
// generates from the org's pools. The org's primary admin (role 'owner') still buys: that is one
// of the two ways an org tops up its pool (Owner, 2026-11-22). After the org removes a member it
// buys like anyone else, and so does a member of a suspended org (Owner 2026-11-23): the org then
// funds nothing. Checked by the checkout route before any session is created or reused, and by
// code redemption (409 ORG_MEMBER_CHECKOUT).
export async function isActiveOrgMember(admin: SupabaseClient, userId: string): Promise<boolean> {
  const { data, error } = await admin.from('org_members').select('org_id, orgs!inner(status)')
    .eq('user_id', userId).eq('status', 'active').eq('role', 'member').eq('orgs.status', 'active').limit(1)
  if (error) throw new AppError('INTERNAL', 'org membership check failed', { cause: new Error(error.message) })
  return data.length > 0
}

// Any active member of an active org, the primary admin included (Owner 2026-11-28, 2032): while
// they are one, they can use no redemption or discount code at all.
export async function isInActiveOrg(admin: SupabaseClient, userId: string): Promise<boolean> {
  const { data, error } = await admin.from('org_members').select('org_id, orgs!inner(status)')
    .eq('user_id', userId).eq('status', 'active').eq('orgs.status', 'active').limit(1)
  if (error) throw new AppError('INTERNAL', 'org membership check failed', { cause: new Error(error.message) })
  return data.length > 0
}

export async function assertNotOrgMember(admin: SupabaseClient, userId: string): Promise<void> {
  if (await isActiveOrgMember(admin, userId)) throw new AppError('ORG_MEMBER_CHECKOUT', 'Active org members buy through their organisation')
}
